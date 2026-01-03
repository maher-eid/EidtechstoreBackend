require("dotenv").config();
const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  next();
});

const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.BASE_URL || "";

/* ======================
   MYSQL CONNECTION (FIRST)
   ====================== */
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306,
  connectionLimit: 10,
});

/* ======================
   TEST DB CONNECTION
   ====================== */
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ DB connection failed:", err);
  } else {
    console.log("✅ DB connected successfully");
    connection.release();
  }
});

/* ======================
   FILE STORAGE
   ====================== */
const imagesDir = path.join(__dirname, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
app.use("/images", express.static(imagesDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok =
      allowed.test(file.mimetype) &&
      allowed.test(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(new Error("Only image files allowed"));
  },
});

/* ======================
   ROUTES
   ====================== */

app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend connected successfully" });
});

app.post("/user/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields required" });

  const q =
    "INSERT INTO users (name, email, password, isAdmin) VALUES (?, ?, ?, 0)";
  db.query(q, [name.trim(), email.trim(), password], (err, result) => {
    if (err) return res.status(500).json({ message: "Registration failed" });
    res.status(201).json({ message: "Account created", userId: result.insertId });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const q = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(q, [email, password], (err, data) => {
    if (err || data.length === 0)
      return res.status(401).json({ message: "Invalid credentials" });

    res.json({
      message: "Login successful",
      user: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
        isAdmin: data[0].isAdmin === 1,
      },
    });
  });
});

app.get("/products", (req, res) => {
  db.query("SELECT * FROM products ORDER BY id DESC", (err, data) => {
    if (err)
      return res.status(500).json({ message: "Failed to fetch products" });

    res.json(
      data.map((p) => ({
        ...p,
        image: `${BASE_URL}/images/${p.image}`,
      }))
    );
  });
});

/* ======================
   ERROR HANDLER
   ====================== */
app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message || "Server error" });
});

/* ======================
   START SERVER
   ====================== */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
