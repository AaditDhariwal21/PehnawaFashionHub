import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "pehnawa/products",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
        // Incoming transformation applied ONCE at upload time. It only caps
        // the *stored master* — it does not change the delivery URL shape and
        // does not touch any already-uploaded image.
        //
        // Why: phone/DSLR product shots arrive as 4000–6000px, multi-MB files.
        // c_limit downscales the longest side to 2000px WITHOUT ever upscaling
        // smaller images and WITHOUT cropping (aspect ratio preserved). 2000px
        // is still comfortably larger than any surface renders (the detail hero
        // tops out around 1350px at 3× DPR), so quality is untouched while we
        // stop paying to store and derive from needlessly huge masters.
        //
        // The real per-request savings still come from the delivery-time
        // f_auto,q_auto,w_… transforms applied on the frontend; this is
        // defense-in-depth so a giant original can never sit in storage again.
        transformation: [{ width: 2000, height: 2000, crop: "limit" }],
    },
});

const upload = multer({ storage });

export default upload;
