import { useState, useEffect } from "react";
import { ManualEntry, Platform, TradeType } from "../types";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "crypto.com", label: "Crypto.com" },
  { value: "hyperliquid", label: "Hyperliquid" },
  { value: "blur", label: "Blur" },
  { value: "ethereum", label: "Ethereum" },
  { value: "solana", label: "Solana" },
  { value: "other", label: "Other" },
];

const TRADE_TYPES: { value: TradeType; label: string }[] = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "swap", label: "Swap" },
  { value: "transfer", label: "Transfer" },
  { value: "liquidation", label: "Liquidation" },
  { value: "airdrop", label: "Airdrop" },
  { value: "other", label: "Other" },
];

interface Props {
  initialValues?: Partial<ManualEntry>;
  onSave: (entry: ManualEntry) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

export default function ManualEntryForm({ initialValues, onSave, onCancel, isEditing = false }: Props) {
  const [platform, setPlatform] = useState<Platform>(initialValues?.platform ?? "blur");
  const [type, setType] = useState<TradeType>(initialValues?.type ?? "liquidation");
  const [date, setDate] = useState(initialValues?.date ? initialValues.date.split("T")[0] : new Date().toISOString().split("T")[0]);
  const [asset, setAsset] = useState(initialValues?.asset ?? "");
  const [amount, setAmount] = useState(initialValues?.amount ? String(initialValues.amount) : "");
  const [priceUsd, setPriceUsd] = useState(initialValues?.priceUsd ? String(initialValues.priceUsd) : "");
  const [totalValueUsd, setTotalValueUsd] = useState(initialValues?.totalValueUsd ? String(initialValues.totalValueUsd) : "");
  const [feesUsd, setFeesUsd] = useState(initialValues?.feesUsd ? String(initialValues.feesUsd) : "");
  const [costBasisUsd, setCostBasisUsd] = useState(initialValues?.costBasisUsd != null ? String(initialValues.costBasisUsd) : "");
  const [gainLossUsd, setGainLossUsd] = useState(initialValues?.gainLossUsd != null ? String(initialValues.gainLossUsd) : "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [txHash, setTxHash] = useState(initialValues?.txHash ?? "");

  useEffect(() => {
    const a = parseFloat(amount);
    const p = parseFloat(priceUsd);
    if (!isNaN(a) && !isNaN(p) && a > 0 && p > 0) {
      setTotalValueUsd(String((a * p).toFixed(2)));
    }
  }, [amount, priceUsd]);

  useEffect(() => {
    const total = parseFloat(totalValueUsd);
    const cost = parseFloat(costBasisUsd);
    if (!isNaN(total) && !isNaN(cost) && cost > 0) {
      setGainLossUsd(String((total - cost).toFixed(2)));
    }
  }, [totalValueUsd, costBasisUsd]);

  const handleSave = () => {
    if (!asset.trim()) { alert("Please enter an asset name."); return; }
    if (!amount || parseFloat(amount) <= 0) { alert("Please enter a valid amount."); return; }

    const now = new Date().toISOString();
    const entry: ManualEntry = {
      id: initialValues?.id ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date(date).toISOString(),
      platform,
      type,
      asset: asset.trim(),
      amount: parseFloat(amount) || 0,
      priceUsd: parseFloat(priceUsd) || 0,
      totalValueUsd: parseFloat(totalValueUsd) || 0,
      feesUsd: parseFloat(feesUsd) || 0,
      costBasisUsd: costBasisUsd ? parseFloat(costBasisUsd) : undefined,
      gainLossUsd: gainLossUsd ? parseFloat(gainLossUsd) : undefined,
      txHash: txHash.trim() || undefined,
      source: "manual",
      notes: notes.trim() || undefined,
      createdAt: (initialValues as ManualEntry)?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(entry);
  };

  return (
    <div>
      <label className="form-label">Date</label>
      <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      <label className="form-label">Platform</label>
      <div className="option-row">
        {PLATFORMS.map((p) => (
          <button key={p.value} className={`option-chip ${platform === p.value ? "active" : ""}`} onClick={() => setPlatform(p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      <label className="form-label">Type</label>
      <div className="option-row">
        {TRADE_TYPES.map((t) => (
          <button key={t.value} className={`option-chip ${type === t.value ? "active" : ""}`} onClick={() => setType(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <label className="form-label">Asset Name *</label>
      <input className="form-input" value={asset} onChange={(e) => setAsset(e.target.value)} placeholder="e.g., ETH, BTC, Pudgy Penguins" />

      <label className="form-label">Amount *</label>
      <input className="form-input" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />

      <label className="form-label">Price per unit (USD)</label>
      <input className="form-input" type="number" step="any" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="0.00" />

      <label className="form-label">Total Value (USD) - auto-calculated</label>
      <input className="form-input" type="number" step="any" value={totalValueUsd} onChange={(e) => setTotalValueUsd(e.target.value)} placeholder="Auto-calculated or override" />

      <label className="form-label">Fees (USD, optional)</label>
      <input className="form-input" type="number" step="any" value={feesUsd} onChange={(e) => setFeesUsd(e.target.value)} placeholder="0.00" />

      <label className="form-label">Cost Basis (USD, optional - for tax calc)</label>
      <input className="form-input" type="number" step="any" value={costBasisUsd} onChange={(e) => setCostBasisUsd(e.target.value)} placeholder="Original purchase cost" />

      <label className="form-label">Gain/Loss (USD) - auto-calculated if cost basis provided</label>
      <input className="form-input" type="number" step="any" value={gainLossUsd} onChange={(e) => setGainLossUsd(e.target.value)} placeholder="Auto-calculated or override" />

      <label className="form-label">Notes</label>
      <textarea className="form-input form-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder='e.g., "Blur NFT liquidation, collection X"' />

      <label className="form-label">TX Hash / Reference (optional)</label>
      <input className="form-input" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x... or reference ID" />

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={handleSave}>
          {isEditing ? "Update Entry" : "Save Entry"}
        </button>
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
