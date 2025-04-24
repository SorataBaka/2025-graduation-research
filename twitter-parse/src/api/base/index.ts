import { Router } from "express";
import Default from "../middlewares/default";
import PostRouter from "./post";

const baseRouter = Router();

baseRouter.all("/", Default);
baseRouter.use("/post", PostRouter);

export default baseRouter;
