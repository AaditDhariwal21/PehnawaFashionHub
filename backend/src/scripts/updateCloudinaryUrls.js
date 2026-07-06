import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Products.js";

dotenv.config();

const OLD_CLOUD = "dvgvhqx1u";
const NEW_CLOUD = "pehnawa";

async function updateCloudinaryUrls() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("✅ Connected to MongoDB");

        const products = await Product.find();

        let updatedProducts = 0;
        let updatedImages = 0;

        for (const product of products) {
            let changed = false;

            // Update main product images
            if (product.images?.length) {
                for (const image of product.images) {
                    if (image.url.includes(OLD_CLOUD)) {
                        image.url = image.url.replace(
                            `res.cloudinary.com/${OLD_CLOUD}`,
                            `res.cloudinary.com/${NEW_CLOUD}`
                        );
                        changed = true;
                        updatedImages++;
                    }
                }
            }

            // Update color images
            if (product.colors?.length) {
                for (const color of product.colors) {
                    for (const image of color.images) {
                        if (image.url.includes(OLD_CLOUD)) {
                            image.url = image.url.replace(
                                `res.cloudinary.com/${OLD_CLOUD}`,
                                `res.cloudinary.com/${NEW_CLOUD}`
                            );
                            changed = true;
                            updatedImages++;
                        }
                    }
                }
            }

            if (changed) {
                await product.save();
                updatedProducts++;
            }
        }

        console.log("--------------------------------");
        console.log(`Updated Products : ${updatedProducts}`);
        console.log(`Updated Images   : ${updatedImages}`);
        console.log("--------------------------------");

        process.exit(0);

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

updateCloudinaryUrls();