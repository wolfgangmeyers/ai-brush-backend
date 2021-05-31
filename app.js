import express from "express"

// @type: express.Application
const app = express()

app.get("/jobs", (req, res) => {
    res.status(200).send({jobs: []})
})

export default app