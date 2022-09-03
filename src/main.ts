require('dotenv').config();

import axios, { AxiosError, AxiosResponse } from "axios";
import * as R from "ramda";


const P2P_ENDPOINT = "https://p2p.binance.com";
const P2P_ROW_REQUEST = 5;
const DEFAULT_CRYPTO = "USDT";
const DEFAULT_FIAT = "MMK";

const P2P_BUYERS = "BUYERS";
const P2P_SELLERS = "SELLERS";

const BRANDING_TEXT = "⚡ by https://t.me/TheKoalas";

const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN);

const REGEX_BUY_P2P_FILTER_COMMAND = new RegExp(/buyp2p_(.+)/i);
const REGEX_SELL_P2P_FILTER_COMMAND = new RegExp(/sellp2p_(.+)/i);
const REGEX_ALL_OTHER_COMMANDS = new RegExp(/./i);

import {
  IPSPRequestOption,
  Crypto,
  Fiat,
  TradeType,
  IP2PResponse,
  IOrder,
} from "./p2p";

bot.command('start', ctx => {
  ctx.reply("Koala Overlord 🐨 welcomes you.");
});

bot.command('buyp2p', async (ctx) => {
  const answers = {
    crypto: DEFAULT_CRYPTO,
    fiat: DEFAULT_FIAT,
    tradeType: 'Buy'
  } as IAskResponse

  const sorted = await requestSortedBinanceP2POrders(answers);

  if (sorted.length == 0) {
    ctx.reply(`Sorry! No one is selling ${DEFAULT_CRYPTO} at the moment.`);
    return;
  }

  const reply_prefix = `🐨 5 Best Binance P2P ${P2P_SELLERS} 🐨\n\n`;

  ctx.reply(reply_prefix + generateListings(sorted, answers).toString() + BRANDING_TEXT,
    {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  );
})

bot.hears(REGEX_BUY_P2P_FILTER_COMMAND, async (ctx) => {
  let amount = ctx.message.text.substring(ctx.message.text.indexOf('_') + 1);

  if (isNaN(amount)) {
    ctx.reply('Please use the correct format. (e.g. "listp2p_100000")');
    return;
  }

  const answers = {
    crypto: DEFAULT_CRYPTO,
    fiat: DEFAULT_FIAT,
    tradeType: 'Buy',
    transAmount: `${amount}`
  } as IAskResponse

  const sorted = await requestSortedBinanceP2POrders(answers);

  if (sorted.length == 0) {
    ctx.reply(`Sorry! No ${P2P_SELLERS} found for ${thousandSeparator(parseInt(amount))} ${DEFAULT_FIAT}.`);
    return;
  }

  const reply_prefix = `🐨 ${sorted.length} Binance P2P ${P2P_SELLERS} For ${thousandSeparator(parseInt(amount))} ${DEFAULT_FIAT} 🐨\n\n`;

  ctx.reply(reply_prefix + generateListings(sorted, answers).toString() + BRANDING_TEXT,
    {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  );
});

bot.command('sellp2p', async (ctx) => {
  const answers = {
    crypto: DEFAULT_CRYPTO,
    fiat: DEFAULT_FIAT,
    tradeType: 'Sell'
  } as IAskResponse

  const sorted = await requestSortedBinanceP2POrders(answers);

  if (sorted.length == 0) {
    ctx.reply(`Sorry! No one is buying ${DEFAULT_CRYPTO} at the moment.`);
    return;
  }

  const reply_prefix = `🐨 5 Best Binance P2P ${P2P_BUYERS} 🐨\n\n`;

  ctx.reply(reply_prefix + generateListings(sorted, answers).toString() + BRANDING_TEXT,
    {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  );
})

bot.hears(REGEX_SELL_P2P_FILTER_COMMAND, async (ctx) => {
  let amount = ctx.message.text.substring(ctx.message.text.indexOf('_') + 1);

  if (isNaN(amount)) {
    ctx.reply('Please use the correct format. (e.g. "sellp2p_100000")');
    return;
  }

  const answers = {
    crypto: DEFAULT_CRYPTO,
    fiat: DEFAULT_FIAT,
    tradeType: 'Sell',
    transAmount: `${amount}`
  } as IAskResponse

  const sorted = await requestSortedBinanceP2POrders(answers);

  if (sorted.length == 0) {
    ctx.reply(`Sorry! No ${P2P_BUYERS} found for ${thousandSeparator(parseInt(amount))} ${DEFAULT_FIAT}.`);
    return;
  }

  const reply_prefix = `🐨 ${sorted.length} Binance P2P Buyers For ${thousandSeparator(parseInt(amount))} ${DEFAULT_FIAT} 🐨\n\n`;

  ctx.reply(reply_prefix + generateListings(sorted, answers).toString() + BRANDING_TEXT,
    {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  );
});

bot.hears(REGEX_ALL_OTHER_COMMANDS, ctx => {
  ctx.reply("Sorry, I don't understand that command yet.");
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

interface IAskResponse {
  crypto: Crypto;
  fiat: Fiat;
  tradeType: TradeType;
  transAmount: string;
}

async function requestSortedBinanceP2POrders(answers: IAskResponse): Promise<IOrder[]> {
  const requestOptions = prepareP2POption(answers);
  const p2pResponse = await requestP2P(requestOptions);
  const orders = p2pResponse.data;

  return sortOrderWithPriceAndFinishRate(orders);
}

async function requestBinanceP2P(
  requestOptions: IPSPRequestOption
): Promise<IP2PResponse> {
  const url = `${P2P_ENDPOINT}/bapi/c2c/v2/friendly/c2c/adv/search`;

  const headers = {
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
  };

  const response = await axios.post<
    IPSPRequestOption,
    AxiosResponse<IP2PResponse>
  >(url, requestOptions, {
    headers,
  });
  return response.data;
}

async function requestP2P(options: IPSPRequestOption): Promise<IP2PResponse> {
  try {
    const p2pResponse = await requestBinanceP2P(options);
    return p2pResponse;
  } catch (error) {
    if (error && error.response) {
      const axiosError = error as AxiosError<IP2PResponse>;
      return axiosError.response.data;
    }

    throw error;
  }
}

function prepareP2POption(answers: IAskResponse): IPSPRequestOption {
  const options: IPSPRequestOption = {
    page: 1,
    rows: P2P_ROW_REQUEST || 10,
    asset: answers.crypto,
    tradeType: answers.tradeType,
    fiat: answers.fiat,
    transAmount: answers.transAmount
  };
  return options;
}

export function sortOrderWithPriceAndFinishRate(orders: IOrder[]): IOrder[] {
  const priceAscend = R.ascend(R.path(["adv", "price"]));
  const finishRateDescend = R.descend(
    R.path(["advertiser", "monthFinishRate"])
  );

  const sortWithPriceAndFinishRate = R.sortWith([
    priceAscend,
    finishRateDescend,
  ]);
  const sorted = sortWithPriceAndFinishRate(orders);

  return sorted;
}

export function sortOrderWithPrice(orders: IOrder[]): IOrder[] {
  const priceAscend = R.ascend(R.path(["adv", "price"]));
  const sortWithPrice = R.sortWith([priceAscend]);
  const sorted = sortWithPrice(orders);

  return sorted;
}

function thousandSeparator(number: number, fractionDigits: number = 0): string {
  const defaultLocale = undefined;
  const formatted = number.toLocaleString(defaultLocale, {
    minimumFractionDigits: fractionDigits,
  });
  return formatted;
}

function generateListings(orders: IOrder[], answers: IAskResponse) {
  let listings = '';

  orders = sortOrderWithPrice(orders);

  if(answers.tradeType == 'Sell') {
    orders = R.reverse(orders);
  }
  
  for (const order of orders) {
    // const monthOrderCount = order.advertiser.monthOrderCount;
    // const monthFinishRate = order.advertiser.monthFinishRate * 100;
    const nickName = order.advertiser.nickName;
    const price = order.adv.price;
    const advertiserNo = order.advertiser.userNo;
    const available = order.adv.surplusAmount;
    // const monthFinishRatePercent = `${monthFinishRate.toFixed(2)}%`;
    const userType = order.advertiser.userType;
    const nickNameWithUserType =
    userType === "merchant"
        ? `${nickName} (${userType})`
        : nickName;

    listings += `Price ${answers.fiat}: ` + thousandSeparator(parseInt(price)) + '\n';
    listings += `Available ${answers.crypto}: ` + thousandSeparator(parseFloat(available), 2) + '\n';

    if(answers.tradeType == 'Buy') {
      listings += 'Seller: ';
    } else {
      listings += 'Buyer: ';
    }

    listings += `<a href='${P2P_ENDPOINT}/en/advertiserDetail?advertiserNo=${advertiserNo}'>` +
    `${nickNameWithUserType}</a>` + '\n';

    listings += 'Payments: ';

    for (const tradeMethod of order.adv.tradeMethods) {
      if (tradeMethod.tradeMethodName != null)
        listings += tradeMethod.tradeMethodName + ', ';
    }

    listings = listings.substring(0, listings.lastIndexOf(','));

    listings +=  '\n\n';
  }

  return listings;
}