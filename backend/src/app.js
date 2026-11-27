require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const connectDB = require("./utils/db");

const authRoutes = require("./routes/authRoutes");
const locationRoutes = require("./routes/locationRoutes");
const preferenceRoutes = require("./routes/preferenceRoutes");
const contactRoutes = require("./routes/contactRoutes");
const mlRoutes = require("./routes/mlRoutes");
const areaRiskRoutes = require("./routes/areaRiskRoutes");

const app = express();

connectDB();

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/area-risk", areaRiskRoutes);

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON body. Send a raw JSON object, not a quoted JSON string.",
        });
    }

    next(err);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, ()=>{
    console.log(`SafeCity backend running on port ${PORT}`);
})
