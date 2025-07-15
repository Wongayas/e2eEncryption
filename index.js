import express from "express";
import bodyParser from "body-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import pg from "pg";
import dotenv from "dotenv";
import { render } from "ejs";

dotenv.config();
const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
db.connect();

const app = express();
const port = 3000;
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "D:/School/Web development/File_encryption/uploads");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.originalname.substring(0, file.originalname.indexOf(".enc")) +
        "-" +
        Date.now() +
        path.extname(file.originalname)
    );
  },
});
const upload = multer({ storage });

//RENDERING INITIAL PAGE
app.get("/", (req, res) => {
  res.render("index.ejs");
});

//UPLOADING ENCRYPTED FILE TO THE DATABASE AND RETURNING A LINK TO IT
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = {
    file_id: crypto.randomUUID(),
    file_path: req.file.path,
    expirationDate: "",
  };
  const data = await fs.promises.readFile(file.file_path);
  file.expirationDate = data.slice(0, 24).toString("utf-8");
  await db.query(
    "insert into files (file_id, file_path,expiration_date) values ($1,$2,$3)",
    [file.file_id, file.file_path, file.expirationDate]
  );
  console.log("Received file:", req.file);
  res.send(`${req.headers.origin}/download/${file.file_id}`);
});

//PAGE FOR DOWNLOADING THE FILE
app.get("/download/:id", async (req, res) => {
  res.render("download.ejs");
});

app.get("/expired", async (req, res) => {
  res.render("expired.ejs");
});

//FETCHING THE DATA RELATED TO THE FILE
app.get("/file/:id", async (req, res) => {
  const file_id = req.params.id;
  try {
    const result = await db.query(
      "select file_path, expiration_date from files where file_id = $1",
      [file_id]
    );
    if (result.rows.length === 0) {
      console.log("expired");
      return res.status(410).json({ error: "File expired" });
    }
    const data = result.rows[0];
    const file_path = data.file_path;
    const delimiter = Buffer.from("|SEPERATOR|");
    const currDate = new Date().toISOString();
    if (currDate > data.expiration_date) {
      console.log("expired");
      return res.status(410).json({ error: "File expired" });
    }
    console.log(new Date().toISOString());
    console.log(data.expiration_date);
    fs.readFile(file_path, (err, data) => {
      if (err) {
        console.error("Error reading file:", err);
        return;
      }
      const file_data = {
        salt: Buffer.from(data.slice(24, 40)).toString("base64"),
        iv: Buffer.from(data.slice(40, 52)).toString("base64"),
        fileName: data.slice(52, data.indexOf(delimiter)).toString("utf-8"),
        encryptedData: Buffer.from(
          data.slice(data.indexOf(delimiter) + delimiter.length)
        ).toString("base64"),
      };
      res.send(file_data);
    });
  } catch (error) {
    console.log(error);
  }
});

app.listen(port, (req, res) => {
  console.log("The server is being run on port " + port);
});

setInterval(async () => {
  const now = new Date().toISOString();
  try {
    const expiredFiles = await db.query(
      "SELECT file_id, file_path FROM files WHERE expiration_date < $1",
      [now]
    );

    for (const file of expiredFiles.rows) {
      try {
        await db.query("DELETE FROM files WHERE file_id = $1", [file.file_id]);
        await fs.unlink(file.file_path, (err) => {
          if (err) throw err;
          console.log(`Deleted expired file: ${file.file_path}`);
        });
      } catch (err) {
        console.error("Error deleting file:", err);
      }
    }
  } catch (err) {
    console.error("Error querying expired files:", err);
  }
}, 10 * 1000);
