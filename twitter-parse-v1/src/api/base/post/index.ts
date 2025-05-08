import { Router } from "express";
import Default from "../../middlewares/default";
import Create from "./create";
const postRouter = Router();
postRouter.all("/", Default);
postRouter.post("/create", Create);
export default postRouter;
