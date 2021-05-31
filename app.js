import express from "express"

// @type: express.Application
const app = express.application()

app.get("/jobs", (req, res) => {
    res.status(200).send({jobs: []})
})

export default app