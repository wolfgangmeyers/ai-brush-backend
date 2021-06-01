const AWS = require('aws-sdk');
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
