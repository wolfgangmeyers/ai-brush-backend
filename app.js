const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const express = require("express")
const cors = require("cors")
const uuid = require("uuid")
const fs = require("fs")
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
        const jobs = data.Items.map(item => converter.unmarshall(item))
        res.status(200).send({ jobs: jobs })
    } catch (err) {
        res.status(400).send({"message": "Didn't work"})
    };
})

app.post("/jobs", async (req, res) => {
    const job = req.body
    console.log(job)
    const id = uuid.v4()
    job.id = id
    res.status(201).send(job)
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
