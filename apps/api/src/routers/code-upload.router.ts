import multer from "multer";
import multerS3 from "multer-s3";
import { S3 } from "../lib/s3";
import { Router } from "express";
import { v4 as uuidv4 } from "uuid";

const router = Router();

const upload = multer({
  storage: multerS3({
    s3: S3,
    bucket: "hypercore",
    key: function (req, file, cb) {
      cb(null, uuidv4());
    },
  }),
});

router.post("/", upload.single("file"), function (req, res, next) {
  res.send("Successfully uploaded " + req.file + " files!");
});

export default router;
