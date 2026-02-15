/**
 * Excel export utility — builds a 3-sheet .xlsx workbook from trades.
 *
 * Sheet 1: "All Trades" — every trade in the date range
 * Sheet 2: "Summary" — totals, gains/losses, per-platform breakdown
 * Sheet 3: "Manual Entries Only" — filtered to manual entries
 */

import * as XLSX from "xlsx";
import {
  cacheDirectory,
  writeAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { TradeRecord } from "../types";
import { computeTaxSummary } from "./tax-helpers";

function tradeToRow(trade: TradeRecord) {
  return {
    Date: trade.date.split("T")[0],
    Platform: trade.platform,
    Type: trade.type,
    Asset: trade.asset,
    Amount: trade.amount,
    "Price (USD)": trade.priceUsd,
    "Total Value (USD)": trade.totalValueUsd,
    "Fees (USD)": trade.feesUsd,
    "Cost Basis (USD)": trade.costBasisUsd ?? "",
    "Gain/Loss (USD)": trade.gainLossUsd ?? "",
    "TX Hash": trade.txHash ?? "",
    Source: trade.source === "manual" ? "Manual" : "API",
    Notes: trade.notes ?? "",
  };
}

function buildSummarySheet(trades: TradeRecord[]) {
  const summary = computeTaxSummary(trades);
  const rows: Record<string, any>[] = [];

  rows.push({ Metric: "Total Trades", Value: summary.totalTradesCount });
  rows.push({ Metric: "Total Volume (USD)", Value: summary.totalVolume.toFixed(2) });
  rows.push({ Metric: "Total Realized Gains (USD)", Value: summary.totalRealizedGains.toFixed(2) });
  rows.push({ Metric: "Total Realized Losses (USD)", Value: summary.totalRealizedLosses.toFixed(2) });
  rows.push({ Metric: "Net Gain/Loss for 2025 (USD)", Value: summary.netGainLoss.toFixed(2) });
  rows.push({ Metric: "", Value: "" });

  if (summary.blurLiquidationLoss > 0) {
    rows.push({
      Metric: "*** Blur Liquidation Loss (USD) ***",
      Value: (-summary.blurLiquidationLoss).toFixed(2),
    });
    rows.push({ Metric: "", Value: "" });
  }

  rows.push({ Metric: "--- Breakdown by Platform ---", Value: "" });
  for (const [platform, data] of Object.entries(summary.byPlatform)) {
    rows.push({
      Metric: `  ${platform} — Trades`,
      Value: data.count,
    });
    rows.push({
      Metric: `  ${platform} — Volume`,
      Value: data.volume.toFixed(2),
    });
    rows.push({
      Metric: `  ${platform} — Net Gain/Loss`,
      Value: data.netGainLoss.toFixed(2),
    });
  }

  rows.push({ Metric: "", Value: "" });
  rows.push({ Metric: "--- Breakdown by Asset ---", Value: "" });
  const sortedAssets = Object.entries(summary.byAsset).sort(
    (a, b) => b[1].volume - a[1].volume
  );
  for (const [asset, data] of sortedAssets) {
    rows.push({
      Metric: `  ${asset} — Trades`,
      Value: data.count,
    });
    rows.push({
      Metric: `  ${asset} — Volume`,
      Value: data.volume.toFixed(2),
    });
    rows.push({
      Metric: `  ${asset} — Net Gain/Loss`,
      Value: data.netGainLoss.toFixed(2),
    });
  }

  return rows;
}

export async function exportTrades2025(allTrades: TradeRecord[]) {
  // Filter to 2025
  const trades2025 = allTrades.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === 2025;
  });

  const manualOnly = trades2025.filter((t) => t.source === "manual");

  // Build workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: All Trades
  const allTradesRows = trades2025.map(tradeToRow);
  const ws1 = XLSX.utils.json_to_sheet(allTradesRows);
  XLSX.utils.book_append_sheet(wb, ws1, "All Trades");

  // Sheet 2: Summary
  const summaryRows = buildSummarySheet(trades2025);
  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  // Sheet 3: Manual Entries Only
  const manualRows = manualOnly.map(tradeToRow);
  const ws3 = XLSX.utils.json_to_sheet(
    manualRows.length > 0
      ? manualRows
      : [{ Note: "No manual entries for 2025" }]
  );
  XLSX.utils.book_append_sheet(wb, ws3, "Manual Entries Only");

  // Write to binary string
  const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

  // Save to file system
  const fileName = `crypto-trades-2025.xlsx`;
  const filePath = `${cacheDirectory}${fileName}`;
  await writeAsStringAsync(filePath, wbout, {
    encoding: EncodingType.Base64,
  });

  // Open native share sheet
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Export 2025 Crypto Trades",
      UTI: "com.microsoft.excel.xlsx",
    });
  }

  return filePath;
}
