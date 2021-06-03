const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB.DocumentClient();
const express = require("express")
const cors = require("cors")
const uuid = require("uuid")
const fs = require("fs")
const moment = require("moment")
const validator = require("express-openapi-validator")

const converter = AWS.DynamoDB.Converter
const apiKey = process.env.API_KEY

// @type: express.Application
const app = express()
app.use(express.json())
app.use(cors())


const spec = fs.readFileSync("./openapi.yaml")

app.get("/openapi.yaml", (req, res) => {
    res.status(200).send(spec)
})

// app.use((req, res, next) => {
//     console.log(req.headers)
//     console.log(req.body)
//     next()
// })

app.use(
    validator.middleware({
        apiSpec: './openapi.yaml',
    }),
)

app.use((req, res, next) => {
    if (req.headers["apikey"] != apiKey) {
        res.status(401).send("Unauthorized")
        return
    }
    next()
})

app.get("/jobs", async (req, res) => {
    try {
        let data = await ddb.scan({
            TableName: "jobs"
        }).promise();
        res.status(200).send({ jobs: data.Items })
    } catch (err) {
        res.status(400).send({ "message": "Didn't work" })
    };
})

app.post("/jobs", async (req, res) => {
    const job = req.body
    const id = uuid.v4()
    const created = moment().unix()
    job.id = id
    job.created = created
    job.cancelled = false
    try {
        await ddb.put({
            TableName: "jobs",
            Item: job
        }).promise();
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
        return
    };

    res.status(201).send(job)
})

app.post("/jobs/:id/cancel", async (req, res) => {
    const id = req.params.id
    try {
        await ddb.update({
            TableName: "jobs",
            Key: {
                id: id
            },
            ExpressionAttributeNames: {
                '#cancelled': "cancelled"
            },
            ExpressionAttributeValues: {
                ':cancelled': true
            },
            UpdateExpression: "set #cancelled = :cancelled"
        }).promise();
        res.sendStatus(204)
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };

})

app.get("/jobs/:id", async (req, res) => {
    const id = req.params.id
    try {
        let data = await ddb.get({
            TableName: "jobs",
            Key: {
                id: id,
            }
        }).promise();
        res.status(200).send(data.Item)
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };
})

app.delete("/jobs/:id", async (req, res) => {
    const id = req.params.id
    try {
        await ddb.delete({
            TableName: "jobs",
            Key: {
                id: id
            }
        }).promise();
        res.sendStatus(204)
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };
})

// job results
app.get("/jobs/:id/results", async (req, res) => {
    const jobId = req.params.id
    try {
        // Client can request images and latents in parallel.
        // These are immutable and would ideally be cached on the client.
        // UI doesn't need latents...
        let data = await ddb.query({
            TableName: "job_results_by_job",
            ExpressionAttributeValues: {
                ':job_id': jobId
            },
            KeyConditionExpression: "job_id = :job_id",
        }).promise();

        res.status(200).send({
            results: data.Items
        })
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };

})

app.post("/jobs/:id/results", async (req, res) => {
    const jobId = req.params.id
    const { encoded_image, encoded_latents } = req.body
    const item = {
        id: uuid.v4(),
        job_id: jobId,
        created: moment().unix()
    }
    try {
        // insert record
        await ddb.put({
            TableName: "job_results",
            Item: item

        }).promise();
        res.status(201).send(item)

        // insert by_job index
        await ddb.put({
            TableName: "job_results_by_job",
            Item: {
                job_id: item.job_id,
                result_id: item.id
            }
        }).promise();

        await s3.putObject({
            Bucket: "aibrush-attachments",
            Key: `${item.id}_image`,
            Body: encoded_image,
            Metadata: {}
        }).promise();

        await s3.putObject({
            Bucket: "aibrush-attachments",
            Key: `${item.id}_latents`,
            Body: encoded_latents,
            Metadata: {}
        }).promise();
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };
})

// TODO: get job result by id (include image only for UI, include image and latents for worker)
// so maybe a query string param to include latents
app.get("/job-results/:id", async (req, res) => {
    const id = req.params.id
    try {
        // load record and S3 objects in parallel
        const recordPromise = ddb.get({
            TableName: "job_results",
            Key: {
                id: id
            }
        }).promise();
        
        const imagePromise = s3.getObject({
            Bucket: "aibrush-attachments",
            Key: `${id}_image`
        }).promise();

        const latentsPromise = s3.getObject({
            Bucket: "aibrush-attachments",
            Key: `${id}_latents`
        }).promise();

        const record = await recordPromise;
        const image = await imagePromise;
        const latents = await latentsPromise;

        res.status(200).send({
            ...record,
            encoded_image: new TextDecoder().decode(image.Body),
            encoded_latents: new TextDecoder().decode(latents.Body)
        })
    } catch (err) {
        console.error(err)
        res.status("400").send("Operation failed")
    };

})

app.use((err, req, res, next) => {
    // format error
    if (err) {
        console.error(err)
        res.status(err.status || 500).json({
            message: err.message,
            errors: err.errors,
        });
    }
});

module.exports = app
