const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const express = require("express")

const converter = AWS.DynamoDB.Converter

// @type: express.Application
const app = express()

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

module.exports = app
