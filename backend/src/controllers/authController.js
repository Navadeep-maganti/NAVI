const User = require("../models/User");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const generateToken = (id) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: "7d"});
};

const registerUser = async (req,res) => {
    try{
        const {name,email,password} = req.body;

        const existingUser = await User.findOne({email});

        if(existingUser){
            return res.status(400).json({
                success:false,
                message: "User already exists",
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password:hashedPassword,
        });

        res.status(201).json({
            success:true,
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            }
        });
    }catch (error){
        res.status(500).json({
            success:false,
            message:error.message,
        });
    }
};

const loginUser = async (req,res) => {
    try{
        const {email,password} = req.body;

        const user = await User.findOne({email});

        if(!user){
            return res.status(400).json({
                success: false,
                message: "Invalid email",
            })
        }

        const isMatch = await bcrypt.compare(password,user.password);

        if(!isMatch){
            return res.status(400).json({
                success: false,
                message: "Incorrect password",
            });
        }

        res.status(200).json({
            success: true,
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.emal,
            },
        });
    } catch (error){
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const registerDeviceToken = async (req, res) => {
    try {
        const { fcmToken, platform } = req.body;
        if (typeof fcmToken !== "string" || !fcmToken.trim()) {
            return res.status(400).json({ success: false, message: "fcmToken is required" });
        }
        if (platform !== undefined && !["android", "ios"].includes(platform)) {
            return res.status(400).json({ success: false, message: "platform must be android or ios" });
        }

        await User.findByIdAndUpdate(req.user.id, {
            fcmToken: fcmToken.trim(),
            pushPlatform: platform || null,
        });
        return res.status(200).json({ success: true, message: "Device push token registered" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const clearDeviceToken = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { fcmToken: null, pushPlatform: null });
        return res.status(200).json({ success: true, message: "Device push token cleared" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || typeof newPassword !== "string" || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "currentPassword and newPassword (min 6 chars) are required",
            });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
            return res.status(400).json({ success: false, message: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        return res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || "Failed to update password" });
    }
};

module.exports = {
    registerUser,
    loginUser,
    registerDeviceToken,
    clearDeviceToken,
    changePassword,
};