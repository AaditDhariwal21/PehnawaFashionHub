// Upload Images Controller
export const uploadImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files uploaded",
            });
        }

        // Get the URLs of the uploaded images from Cloudinary
        const imageUrls = req.files.map((file) => ({
            url: file.path,
            public_id: file.filename,
        }));

        res.status(200).json({
            success: true,
            message: "Images uploaded successfully",
            images: imageUrls,
        });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({
            success: false,
            message: "Error uploading images",
            error: error.message,
        });
    }
};
