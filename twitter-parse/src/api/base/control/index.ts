import { Router } from "express";
import DefaultMiddleware from "../../middlewares/default";
const controlRouter = Router();
controlRouter.use("/", DefaultMiddleware);

export default controlRouter;
