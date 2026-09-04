import express, { Request, Response } from "express";
import auth from "../middleware/auth.js";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";

const uploadRouter = express.Router();

const storage = multer.memoryStorage(); // We use memory storage to store the file in memory
const upload = multer({ storage });     // We use multer to upload the file

uploadRouter.post('/', auth, upload.single('image'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(404).json({ message: "No image found" });
    }

    const b64 = Buffer.from(file.buffer).toString("base64");     // Convert to base64 string (contenido binario)
    const dataURI = "data:" + file.mimetype + ";base64," + b64;  // Convert to data URI. Es una representación completa del archivo en una cadena de texto.
    const result = await cloudinary.uploader.upload(dataURI, {   // Upload to cloudinary
      folder: "grocery-del",
      resource_type: "auto",
    })

    res.json({ url: result.secure_url });                         // Return the secure url of the image
  } catch (error: any) {
    console.log(error)
    res.status(500).json({
      message: error.message
    })
  }
})

export default uploadRouter;