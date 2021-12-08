"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const tmp = __importStar(require("tmp"));
const js2xmlparser = __importStar(require("js2xmlparser"));
const switchecommerce = __importStar(require("switchecommerce"));
//Is always required even if the function is not used (timer fired)
async function jobArrived(s, flowElement, job) {
}
/**
 * When the flow starts subscribe to the webhook path
 * @param s
 * @param flowElement
 */
async function flowStartTriggered(s, flowElement) {
    let api_token = await flowElement.getPropertyStringValue("api_token");
    let webhookPath = "/eCommerce";
    try {
        await s.httpRequestSubscribe(HttpRequest.Method.POST, webhookPath, [api_token]);
    }
    catch (error) {
        flowElement.failProcess("Failed to subscribe to the request %1", error.message);
    }
    await flowElement.log(LogLevel.Info, "Subscription started on /scripting" + webhookPath);
}
/**
* Sends back the initial response, the response will be different if the uuid already exists in global data.
* @param request
* @param args
* @param response
* @param s
*/
async function httpRequestTriggeredSync(request, args, response, s) {
    let eCommerceData = request.getBodyAsString();
    let eCommerceParse = JSON.parse(eCommerceData);
    let jobID = eCommerceParse.orderId.toString();
    let processedIDS = {};
    let idsFromGlobalData = await s.getGlobalData(Scope.FlowElement, "uuids");
    if (idsFromGlobalData !== "") {
        processedIDS = JSON.parse(idsFromGlobalData);
    }
    if (jobID in processedIDS == true) {
        response.setStatusCode(418);
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('api_token', args[0]);
        response.setBody(Buffer.from(JSON.stringify({ "result": "error", "message": "eCommerce order with UUID " + jobID + " already exists", "api_token": args[0] })));
    }
    else {
        response.setStatusCode(200);
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('api_token', args[0]);
        response.setBody(Buffer.from(JSON.stringify({ "result": "success", "orderID": jobID, "api_token": args[0] })));
        processedIDS[jobID] = { arrival: new Date().getTime(), product: eCommerceParse.product.productName };
        await s.setGlobalData(Scope.FlowElement, 'uuids', JSON.stringify(processedIDS));
    }
}
/**
 * Processes the request by downloading the production file from the defined url and injecting in the flow while at the same time attaching the product description as a dataset
 * @param request
 * @param args
 * @param s
 * @param flowElement
 */
async function httpRequestTriggeredAsync(request, args, s, flowElement) {
    //Parse JSON from Body
    let eCommerceData = request.getBodyAsString();
    var eCommerceParse = JSON.parse(eCommerceData);
    let downloadPath = eCommerceParse.filename;
    let downloadFileName = eCommerceParse.filename.split("/").pop();
    let jobID = eCommerceParse.orderId;
    //Define Dataset
    let xmlString = js2xmlparser.parse("eCommerce", eCommerceParse);
    let tmpDatasetFile = tmp.fileSync({ postfix: ".xml" }).name;
    let datasetName = "eCommerce";
    fs.writeFileSync(tmpDatasetFile, xmlString);
    //Download pdf file
    let tmpJobFile = tmp.fileSync({ prefix: "download_" }).name;
    await flowElement.log(LogLevel.Info, "Download of job " + jobID + " in progress");
    let result = await switchecommerce.eCommerceDownloadFile(downloadPath, downloadFileName, jobID);
    await flowElement.log(LogLevel.Info, "Download of job " + jobID + " finished");
    //Create job containing the production file and define dataset
    let job = await flowElement.createJob(result.filePath);
    await job.createDataset(datasetName, tmpDatasetFile, DatasetModel.XML);
    await job.sendToSingle(result.fileName);
    fs.unlinkSync(tmpJobFile);
    fs.unlinkSync(tmpDatasetFile);
}
//# sourceMappingURL=main.js.map