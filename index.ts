import express, { Response } from 'express'
import bodyParser from 'body-parser'
import * as twilio from 'twilio'
import { Stagehand } from "@browserbasehq/stagehand";
import z from 'zod';
import { v4 as uuidv4 } from 'uuid';

const itemPriceTasks: Record<string, { promise: Promise<any>, done: boolean, description: string }> = {};
const itemSellTasks: Record<string, { promise: Promise<any>, done: boolean, description: string }> = {};

const stagehand = new Stagehand({
  env: 'BROWSERBASE'
});

const getItemPrices = async (itemData: {
  description: string;
}) => {

  await stagehand.init();
  await stagehand.page.goto(`https://www.facebook.com/`);
  await stagehand.act({ action: "click on marketplace icon" });
  await stagehand.act({ action: `search for ${itemData.description}` });
  const itemInfo = await stagehand.extract({
    instruction: "extract all the prices",
    schema: z.object({
      items: z.array(z.object({
        description: z.string(),
        price: z.number(),
        sold: z.boolean(),
        location: z.string(),
      })),
    }),
  });
  console.log(itemInfo);
  return itemInfo;
};

const sellItem = async (itemData: {
  description: string;
  price: number;
}): Promise<string> => {
  await stagehand.init();
  await stagehand.act({ action: "click on marketplace icon" });
  await stagehand.act({ action: `click on create new listing` });
  await stagehand.act({ action: `click on item for sale` });
  await stagehand.act({ action: `fill in the title with ${itemData.description}` });
  await stagehand.act({ action: `fill in the price with ${itemData.price}` });
  await stagehand.act({ action: `fill in a nice embellished marketable description based on the title ${itemData.description}` });
  await stagehand.act({ action: `fill in the category based on the title of ${itemData.description}. you will have to click through multiple dropdowns to find the correct one.` });
  await stagehand.act({ action: `fill in the condition as used good` });
  await stagehand.act({ action: `upload a photo of the item. The file name is IMG_7788.jpeg` });
  await stagehand.act({ action: `click on next` });
  await stagehand.act({ action: `click on publish` });
  const url = await stagehand.page.url();
  console.log("Item is up for sale!", url);
  return url;
}

const server = express()
const port = 8080

// function sendWithTwilio(body: string, res: Response) {
//   const twiml = new twilio.twiml.MessagingResponse()
//   twiml.message(body)
//   res.type('text/xml').send(twiml.toString())
// }

// function respondWithLLM(message: string, res: Response) {
//   res.status(200).send()
// }

server.use(bodyParser.urlencoded({ extended: true }))
server.use(bodyParser.json())

// server.get('/ping', async (req, res) => {
//   res.send('pong\n')
// })

server.get('/', async (req, res) => {
  res.status(200).send();
})

server.post('/itemInfo', async (req, res) => {
  console.log(req.body)

  const itemData: {
    description: string;
  } = req.body;

  const { description } = itemData;

  const taskId = uuidv4();
  const itemPricesPromise = getItemPrices({
    description
  });

  itemPriceTasks[taskId] = {
    promise: itemPricesPromise,
    description,
    done: false,
  };

  res.status(200).send({
    taskId: uuidv4(),
  })

  await itemPricesPromise;
  itemPriceTasks[taskId].done = true;
  
  res.status(200).send({
    taskId,
  })
})

server.get('/itemInfo/:taskId', async (req, res) => {
  const { taskId } = req.params;
  if (!itemPriceTasks[taskId]) {
    res.status(404).send({ error: "Task not found" });
    return;
  }

  if (!itemPriceTasks[taskId].done) {
    res.status(200).send({ done: false });
    return;
  } else {
    const itemPrices = await itemPriceTasks[taskId].promise;
    const maxPrice = itemPrices.items
      .map((item: { price: number }) => item.price)
      .sort((a: number, b: number) => a - b)[itemPrices.items.length - 1];
    const minPrice = itemPrices.items
      .map((item: { price: number }) => item.price)
      .sort((a: number, b: number) => a - b)[0];
  
    const itemInfo = {
      description: itemPriceTasks[taskId].description,
      priceRange: [minPrice, maxPrice],
    }
    res.status(200).send(itemInfo);
    return;
  }
})

server.post('/sellItem', async (req, res) => {
  const itemData: {
    description: string;
    price: number;
  } = req.body;

  const url = await sellItem(itemData);
  res.status(200).send({ url });
})

server.listen({ port }, () => {
  console.log(`Server listening at ${port}`)
})