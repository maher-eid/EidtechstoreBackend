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

const PORT = process.env.PORT || 5000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const imagesDir = path.join(__dirname, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
app.use("/images", express.static(imagesDir));

// MySQL connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});


 
// Multer (image upload)
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

// TEST API

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend connected successfully" });
});


// USER REGISTER

app.post("/user/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields required" });

  const q =
    "INSERT INTO users (name, email, password, isAdmin) VALUES (?, ?, ?, 0)";
  db.query(q, [name.trim(), email.trim(), password], (err, result) => {
    if (err)
      return res.status(500).json({ message: "Registration failed" });

    res.status(201).json({
      message: "Account created",
      userId: result.insertId,
    });
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
console.log({
  host: process.env.DB_HOST,
  db: process.env.DB_NAME,
  port: process.env.DB_PORT
});


// =======================
// ADMIN LOGIN (EXPLICIT)
// =======================
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;
  const q =
    "SELECT * FROM users WHERE email = ? AND password = ? AND isAdmin = 1";

  db.query(q, [email, password], (err, data) => {
    if (err || data.length === 0)
      return res
        .status(401)
        .json({ message: "Invalid admin credentials" });

    res.json({
      message: "Admin login successful",
      admin: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
      },
    });
  });
});
app.get("/api/db-check", (req, res) => {
  db.query("SELECT COUNT(*) AS count FROM products", (err, data) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json(err);
    }
    res.json(data);
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

app.get("/products/:id", (req, res) => {
  db.query(
    "SELECT * FROM products WHERE id = ?",
    [req.params.id],
    (err, data) => {
      if (err || data.length === 0)
        return res.status(404).json({ message: "Product not found" });

      res.json({
        ...data[0],
        image: `${BASE_URL}/images/${data[0].image}`,
      });
    }
  );
});

app.post("/products", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;
  if (!req.file)
    return res.status(400).json({ message: "Image required" });

  const q =
    "INSERT INTO products (name, price, image, description, stock, category_id) VALUES (?, ?, ?, ?, 0, 1)";
  db.query(
    q,
    [name, price, req.file.filename, description],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Add product failed" });

      res.status(201).json({
        message: "Product added",
        id: result.insertId,
      });
    }
  );
});

app.delete("/products/:id", (req, res) => {
  db.query(
    "SELECT image FROM products WHERE id = ?",
    [req.params.id],
    (err, data) => {
      if (!data || data.length === 0)
        return res.status(404).json({ message: "Not found" });

      const img = path.join(imagesDir, data[0].image);
      if (fs.existsSync(img)) fs.unlinkSync(img);

      db.query(
        "DELETE FROM products WHERE id = ?",
        [req.params.id],
        () => res.json({ message: "Product deleted" })
      );
    }
  );
});

app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message || "Server error" });
});

// START SERVER
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
});
