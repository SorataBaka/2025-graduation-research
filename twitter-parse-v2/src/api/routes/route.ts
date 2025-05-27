import { Router } from "express";
import DefaultHandler from "../middleware/default";
const router = Router();
router.all("/", DefaultHandler);
export default router;
