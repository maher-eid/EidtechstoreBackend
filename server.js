require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
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
const BASE_URL = process.env.BASE_URL || "https://gleaming-wisdom-production.up.railway.app";


const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306,
  connectionLimit: 10,
});

/*
   TEST DB CONNECTION*/
db.getConnection((err, connection) => {
  if (err) {
    console.error(" DB connection failed:", err);
  } else {
    console.log(" DB connected successfully");
    connection.release();
  }
});

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

/* ROUTES*/

app.get("/", (req, res) => {
  res.send("Backend is running ");
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
      data.map((p) => {
        let imageUrl = p.image;
        if (imageUrl.startsWith('http')) {
          // Check if it's the problematic placeholder
          if (imageUrl.includes('via.placeholder.com')) {
            imageUrl = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
          }
        } else {
          imageUrl = `${BASE_URL}/images/${p.image}`;
        }
        return { ...p, image: imageUrl };
      })
    );
  });
});
app.post("/products", upload.single("image"), (req, res) => {
  const { name, price, description } = req.body;

  if (!name || !price || !req.file) {
    return res.status(400).json({
      message: "Name, price, and image are required",
    });
  }

  const imageName = req.file.filename;

  const q =
    "INSERT INTO products (name, price, description, image) VALUES (?, ?, ?, ?)";

  db.query(q, [name, price, description || "", imageName], (err, result) => {
    if (err) {
      console.error("Insert product error:", err);
      return res.status(500).json({ message: "Failed to add product" });
    }

    res.status(201).json({
      message: "Product added successfully",
      productId: result.insertId,
    });
  });
});
app.delete("/products/:id", (req, res) => {
  const { id } = req.params;

  
  db.query("SELECT image FROM products WHERE id = ?", [id], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const imageName = rows[0].image;
    const imagePath = path.join(__dirname, "images", imageName);

    // delete product from DB
    db.query("DELETE FROM products WHERE id = ?", [id], (err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to delete product" });
      }

      // delete image file 
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }

      res.json({ message: "Product deleted successfully" });
    });
  });
});




app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message || "Server error" });
});

/* START SERVER*/
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
