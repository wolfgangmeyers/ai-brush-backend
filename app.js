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
            results: data.Items.map(item => ({ id: item.result_id, job_id: item.job_id }))
        })
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };

})

app.post("/jobs/:id/results", async (req, res) => {
    const jobId = req.params.id
    const { encoded_image, encoded_latents } = req.body
    
    const job = (await ddb.get({
        TableName: "jobs",
        Key: {
            id: jobId
        }
    }).promise()).Item

    const item = {
        id: uuid.v4(),
        job_id: jobId,
        created: moment().unix(),
        parent: job.parent,
    }
    try {
        await Promise.all([
            // insert record
            ddb.put({
                TableName: "job_results",
                Item: item

            }).promise(),

            // insert by_job index
            ddb.put({
                TableName: "job_results_by_job",
                Item: {
                    job_id: item.job_id,
                    result_id: item.id
                }
            }).promise(),

            // upload image
            s3.putObject({
                Bucket: "aibrush-attachments",
                Key: `${item.id}_image`,
                Body: encoded_image,
                Metadata: {}
            }).promise(),

            // upload latents
            s3.putObject({
                Bucket: "aibrush-attachments",
                Key: `${item.id}_latents`,
                Body: encoded_latents,
                Metadata: {}
            }).promise(),
        ])

        res.status(201).send(item)
    } catch (err) {
        console.error(err)
        res.status(400).send("Operation failed")
    };
})

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
            ...record.Item,
            encoded_image: new TextDecoder().decode(image.Body),
            encoded_latents: new TextDecoder().decode(latents.Body)
        })
    } catch (err) {
        console.error(err)
        res.status("400").send("Operation failed")
    };
})

app.delete("/job-results/:id", async (req, res) => {
    const id = req.params.id

    try {
        const jobResult = await ddb.get({
            TableName: "job_results",
            Key: {
                id: id
            }
        }).promise()
        const jobId = jobResult.Item.job_id

        await Promise.all([
            ddb.delete({
                TableName: "job_results_by_job",
                Key: {
                    job_id: jobId,
                    result_id: id
                }
            }).promise(),
            ddb.delete({
                TableName: "job_results",
                Key: {
                    id: id
                }
            }).promise(),
            s3.deleteObject({
                Bucket: "aibrush-attachments",
                Key: `${id}_latents`
            }).promise(),
            s3.deleteObject({
                Bucket: "aibrush-attachments",
                Key: `${id}_image`
            }).promise()
        ])
        res.sendStatus(204)
    } catch (err) {
        console.error(err)
        res.status("400").send("Operation failed")
    }
})

app.put("/job-results/:id", async (req, res) => {
    const id = req.params.id

    // get the result, insert into saved_images with the same id
    // delete the result, delete the job result idx entry
    // return the saved_image
    try {
        const jobResult = await ddb.get({
            TableName: "job_results",
            Key: {
                id: id
            }
        }).promise()

        if (jobResult.id) {
            await Promise.all([
                ddb.put({
                    TableName: "images",
                    Item: {
                        id: id
                    }
                }).promise(),
                ddb.put({
                    TableName: "images_by_created",
                    Item: {
                        id: "ALL",
                        created: jobResult.created
                    }
                }).promise(),
                ddb.delete({
                    TableName: "job_results",
                    Key: {
                        id: id
                    }
                }),
                ddb.delete({
                    TableName: "job_results_by_job",
                    Key: {
                        result_id: id,
                        job_id: jobResult.job_id
                    }
                })
            ])
        }
        res.sendStatus(204)
    } catch (err) {
        console.error(err)
        res.status("400").send("Operation failed")
    }
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
