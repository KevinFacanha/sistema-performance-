import serverless from "serverless-http";
import app from "../server/index.cjs";

const handler = serverless(app);

export default async function handlerProxy(req, res) {
  return handler(req, res);
}
