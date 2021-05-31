const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const express = require("express")
const uuid = require("uuid")

const converter = AWS.DynamoDB.Converter
const apiKey = process.env.API_KEY

// @type: express.Application
const app = express()
app.use(express.json())

app.get("/jobs", async (req, res) => {
    try {
        let data = await ddb.scan({
            TableName: "jobs"
        }).promise();
        const jobs = data.Items.map(item => converter.unmarshall(item))
        res.status(200).send({ jobs: [] })
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

module.exports = app
