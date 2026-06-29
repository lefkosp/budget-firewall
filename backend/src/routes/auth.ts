import { Router, Request, Response } from "express";
import { body } from "express-validator";
import { registerUser, loginUser } from "../services/auth.service";
import { validate } from "../middleware/validate";

const router = Router();

router.post(
  "/register",
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 6 }),
    body("name").optional().trim(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password, name } = req.body;
      const result = await registerUser(email, password, name);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.post(
  "/login",
  validate([
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty(),
  ]),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await loginUser(email, password);
      res.json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }
);

export default router;

