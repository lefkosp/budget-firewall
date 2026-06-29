import { Router, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { AuthRequest } from "../types";
import { User } from "../models/User";

const router = Router();

router.get("/", authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

