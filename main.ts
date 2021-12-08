import * as fs from "fs";
import * as tmp from "tmp";
import * as js2xmlparser from "js2xmlparser";
import * as switchecommerce from "switchecommerce"

//Is always required even if the function is not used (timer fired)
async function jobArrived(s: Switch, flowElement: FlowElement, job: Job) {
}

/**
 * When the flow starts subscribe to the webhook path
 * @param s
 * @param flowElement
 */
 async function flowStartTriggered(s: Switch, flowElement: FlowElement) {
    let api_token = await flowElement.getPropertyStringValue("api_token") as string;
    let webhookPath = "/eCommerce";
    try {
      await s.httpRequestSubscribe(HttpRequest.Method.POST, webhookPath, [api_token]);
    } catch (error) {
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
async function httpRequestTriggeredSync(request: HttpRequest, args: any[], response: HttpResponse, s: Switch) {
    let eCommerceData = request.getBodyAsString();
    let eCommerceParse = JSON.parse(eCommerceData)
    let jobID = eCommerceParse.orderId.toString();
    let processedIDS: Record<string, any> = {}
    let idsFromGlobalData = await s.getGlobalData(Scope.FlowElement, "uuids")
    if (idsFromGlobalData !== "") {
      processedIDS = JSON.parse(idsFromGlobalData)
    }
    
    if (jobID in processedIDS == true) {
      response.setStatusCode(418);
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('api_token', args[0]);
      response.setBody(Buffer.from(JSON.stringify({"result":"error","message": "eCommerce order with UUID " + jobID + " already exists","api_token": args[0]})));
    } else {
      response.setStatusCode(200);
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('api_token', args[0]);
      response.setBody(Buffer.from(JSON.stringify({"result":"success","orderID":jobID,"api_token": args[0]})));
      processedIDS[jobID] = { arrival: new Date().getTime(), product: eCommerceParse.product.productName }
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
 async function httpRequestTriggeredAsync(request: HttpRequest, args: any[], s: Switch, flowElement: FlowElement) {
  //Parse JSON from Body
  let eCommerceData = request.getBodyAsString();
  var eCommerceParse = JSON.parse(eCommerceData)
  let downloadPath = eCommerceParse.filename
  let downloadFileName = eCommerceParse.filename.split("/").pop()
  let jobID = eCommerceParse.orderId

  //Define Dataset
  let xmlString = js2xmlparser.parse("eCommerce", eCommerceParse)
  let tmpDatasetFile = tmp.fileSync({ postfix: ".xml" }).name;
  let datasetName = "eCommerce";
  fs.writeFileSync(tmpDatasetFile, xmlString);
  
  //Download pdf file
  let tmpJobFile = tmp.fileSync({ prefix: "download_" }).name;
  await flowElement.log(LogLevel.Info, "Download of job " + jobID + " in progress")
  let result = await switchecommerce.eCommerceDownloadFile(downloadPath, downloadFileName, jobID)
  await flowElement.log(LogLevel.Info, "Download of job " + jobID +  " finished")

  //Create job containing the production file and define dataset
  let job = await flowElement.createJob(result.filePath);
  await job.createDataset(datasetName, tmpDatasetFile, DatasetModel.XML);
  await job.sendToSingle(result.fileName);
  fs.unlinkSync(tmpJobFile);
  fs.unlinkSync(tmpDatasetFile);
}