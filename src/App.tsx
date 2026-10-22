import { useState, useCallback } from 'react'
import { ConnectKitButton } from 'connectkit'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { erc20Abi, parseUnits, formatUnits } from 'viem'
import {
  Shield,
  Zap,
  PauseCircle,
  PlayCircle,
  Settings,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingDown,
  ShoppingCart,
  Radio,
  CreditCard,
  Bot,
  Receipt,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { toast } from 'sonner'
import { buildTxExplorerUrl } from '@/onchain-facts'

// ── Contract config ─────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = '0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
const USDC_DECIMALS = 6
const CHAIN_ID = arcTestnet.id

// SingIt Demo Shop — fixed seller address and catalogue
const SHOP_SELLER = '0x61D23AB5376BF1f91295FF3C2D841c8516735450' as const

const SHOP_ITEMS = [
  {
    id: 'api',
    icon: Radio,
    name: 'API Call Bundle',
    description: '100 LLM inference credits',
    price: '0.50',
    priceRaw: parseUnits('0.50', USDC_DECIMALS),
  },
  {
    id: 'esim',
    icon: CreditCard,
    name: 'eSIM 1 GB Data',
    description: '30-day prepaid data plan',
    price: '3.00',
    priceRaw: parseUnits('3.00', USDC_DECIMALS),
  },
  {
    id: 'gift',
    icon: ShoppingCart,
    name: 'Gift Card $5',
    description: 'Redeemable at 500+ merchants',
    price: '5.00',
    priceRaw: parseUnits('5.00', USDC_DECIMALS),
  },
] as const

type ShopItemId = (typeof SHOP_ITEMS)[number]['id']

const AGENT_ALLOWANCE_ABI = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'agent', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'token', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'perTxCap', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'dailyCap', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'expiry', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'paused', inputs: [], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'spentToday', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'remainingToday', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function', name: 'spend',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'setLimits',
    inputs: [{ name: 'perTxCap_', type: 'uint256' }, { name: 'dailyCap_', type: 'uint256' }, { name: 'expiry_', type: 'uint256' }],
    outputs: [], stateMutability: 'nonpayable',
  },
  { type: 'function', name: 'pause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (raw: bigint | undefined, decimals = USDC_DECIMALS) =>
  raw !== undefined ? Number(formatUnits(raw, decimals)).toFixed(2) : '—'

const fmtAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

const fmtDate = (ts: bigint | undefined) => {
  if (ts === undefined) return '—'
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function parseRevertReason(error: unknown): string {
  const msg = (error as { message?: string })?.message ?? ''
  if (msg.includes('ContractPaused')) return 'Spending is currently paused.'
  if (msg.includes('Expired')) return 'The allowance has expired.'
  if (msg.includes('PerTxCapExceeded')) return 'Amount exceeds the per-transaction cap.'
  if (msg.includes('DailyCapExceeded')) return 'Daily spending cap reached.'
  if (msg.includes('NotAgent')) return 'Only the configured agent can call spend().'
  if (msg.includes('NotOwner')) return 'Only the contract owner can perform this action.'
  if (msg.includes('User rejected') || msg.includes('user rejected')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance or allowance.'
  if (msg.includes('reverted')) {
    const match = msg.match(/reason="([^"]+)"/)
    return match ? `Transaction failed: ${match[1]}` : 'Transaction reverted.'
  }
  return 'Something went wrong. Please try again.'
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/80 shadow-sm">
      <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function TxStatus({
  hash,
  isPending,
  isConfirming,
  isSuccess,
  error,
}: {
  hash?: `0x${string}`
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
}) {
  if (isPending) return (
    <div className="flex items-center gap-2 text-amber-600 text-sm mt-2">
      <Clock size={14} className="animate-spin" />
      <span>Waiting for wallet confirmation…</span>
    </div>
  )
  if (isConfirming) return (
    <div className="flex items-center gap-2 text-blue-600 text-sm mt-2">
      <Clock size={14} className="animate-pulse" />
      <span>Confirming on chain…</span>
    </div>
  )
  if (isSuccess && hash) return (
    <div className="flex items-center gap-2 text-emerald-600 text-sm mt-2">
      <CheckCircle2 size={14} />
      <a
        href={buildTxExplorerUrl(CHAIN_ID, hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-emerald-700 flex items-center gap-1"
      >
        Transaction confirmed <ExternalLink size={10} />
      </a>
    </div>
  )
  if (error) return (
    <div className="flex items-start gap-2 text-rose-600 text-sm mt-2">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>{parseRevertReason(error)}</span>
    </div>
  )
  return null
}

// ── Receipt component ─────────────────────────────────────────────────────────
interface ReceiptItem {
  itemName: string
  itemPrice: string
  txHash: `0x${string}`
  remainingAfter: bigint | undefined
  timestamp: number
}

function ReceiptCard({ receipt, onDismiss }: { receipt: ReceiptItem; onDismiss: () => void }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-700">
          <Receipt size={18} />
          <span className="font-bold text-sm">Payment receipt</span>
        </div>
        <button onClick={onDismiss} className="text-emerald-400 hover:text-emerald-600 text-xs underline">dismiss</button>
      </div>
      <div className="bg-white/80 rounded-xl p-4 space-y-2 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-slate-500">Item</span>
          <span className="font-semibold text-slate-800">{receipt.itemName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Amount</span>
          <span className="font-semibold text-slate-800">${receipt.itemPrice} USDC</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Seller</span>
          <span className="text-slate-600">{fmtAddr(SHOP_SELLER)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Remaining today</span>
          <span className={`font-semibold ${receipt.remainingAfter !== undefined && receipt.remainingAfter < parseUnits('1', USDC_DECIMALS) ? 'text-rose-600' : 'text-emerald-700'}`}>
            ${fmt(receipt.remainingAfter)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Time</span>
          <span className="text-slate-600">{new Date(receipt.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>
      <a
        href={buildTxExplorerUrl(CHAIN_ID, receipt.txHash)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 underline underline-offset-2"
      >
        <ExternalLink size={11} />
        View on Arc Testnet explorer
      </a>
    </div>
  )
}

// ── Demo Shop Panel ────────────────────────────────────────────────────────────
function DemoShopPanel({
  refetch,
  remainingToday,
  perTxCap,
}: {
  refetch: () => void
  remainingToday: bigint | undefined
  perTxCap: bigint | undefined
}) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [selected, setSelected] = useState<ShopItemId | null>(null)
  const [receipt, setReceipt] = useState<ReceiptItem | null>(null)

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isWrongChain = chainId !== CHAIN_ID

  const handleBuy = useCallback((itemId: ShopItemId) => {
    if (!address) return
    const item = SHOP_ITEMS.find(i => i.id === itemId)
    if (!item) return
    reset()
    setSelected(itemId)
    setReceipt(null)
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: AGENT_ALLOWANCE_ABI,
      functionName: 'spend',
      args: [SHOP_SELLER, item.priceRaw],
      chainId: CHAIN_ID,
    })
  }, [address, isWrongChain, switchChain, writeContract, reset])

  // When tx confirms, build receipt + refresh balances
  const selectedItem = selected ? SHOP_ITEMS.find(i => i.id === selected) : null

  const handleReceiptReady = useCallback(() => {
    if (!hash || !selectedItem) return
    refetch()
    // remainingToday will be stale for a moment; show it after refetch triggers re-render
    setReceipt({
      itemName: selectedItem.name,
      itemPrice: selectedItem.price,
      txHash: hash,
      remainingAfter: remainingToday !== undefined && selectedItem
        ? (remainingToday > selectedItem.priceRaw ? remainingToday - selectedItem.priceRaw : 0n)
        : undefined,
      timestamp: Date.now(),
    })
  }, [hash, selectedItem, refetch, remainingToday])

  // Trigger receipt once on success
  const [receiptBuilt, setReceiptBuilt] = useState(false)
  if (isSuccess && !receiptBuilt && hash && selectedItem) {
    setReceiptBuilt(true)
    handleReceiptReady()
  }
  if (!isSuccess && receiptBuilt) setReceiptBuilt(false)

  const isOverPerTxCap = (itemId: ShopItemId, ptxCap: bigint | undefined) => {
    if (!ptxCap) return false
    const item = SHOP_ITEMS.find(i => i.id === itemId)
    return item ? item.priceRaw > ptxCap : false
  }

  const isOverDailyRemaining = (itemId: ShopItemId, remaining: bigint | undefined) => {
    if (remaining === undefined) return false
    const item = SHOP_ITEMS.find(i => i.id === itemId)
    return item ? item.priceRaw > remaining : false
  }

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/80 shadow-sm overflow-hidden">
      {/* Shop header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
          <Bot size={18} className="text-white" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-sm leading-tight">SingIt Demo Shop</h3>
          <p className="text-[11px] text-slate-400 font-mono">seller {fmtAddr(SHOP_SELLER)}</p>
        </div>
        <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
          Arc Testnet
        </span>
      </div>

      {/* Item list */}
      <div className="divide-y divide-slate-50">
        {SHOP_ITEMS.map(item => {
          const overPerTx = isOverPerTxCap(item.id, perTxCap)
          const overDaily = isOverDailyRemaining(item.id, remainingToday)
          const wouldFail = overPerTx || overDaily
          const isBuying = selected === item.id && (isPending || isConfirming)
          const Icon = item.icon

          return (
            <div key={item.id} className={`px-6 py-4 flex items-center gap-4 transition-colors ${wouldFail ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${wouldFail ? 'bg-rose-100' : 'bg-indigo-100'}`}>
                <Icon size={18} className={wouldFail ? 'text-rose-400' : 'text-indigo-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight">{item.name}</p>
                <p className="text-xs text-slate-400 truncate">{item.description}</p>
                {overPerTx && (
                  <p className="text-[11px] text-rose-500 font-medium mt-0.5 flex items-center gap-1">
                    <AlertCircle size={10} /> Exceeds per-tx cap
                  </p>
                )}
                {!overPerTx && overDaily && (
                  <p className="text-[11px] text-rose-500 font-medium mt-0.5 flex items-center gap-1">
                    <AlertCircle size={10} /> Exceeds daily remaining
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-slate-800 tabular-nums text-sm">${item.price}</p>
                <p className="text-[10px] text-slate-400">USDC</p>
              </div>
              <button
                onClick={() => handleBuy(item.id)}
                disabled={isBuying || !address}
                className={`shrink-0 px-4 py-2 rounded-xl font-semibold text-xs transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
                  ${wouldFail
                    ? 'bg-rose-100 text-rose-600 hover:bg-rose-200 border border-rose-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
              >
                {isBuying
                  ? (isPending ? 'Confirm…' : 'Confirming…')
                  : isWrongChain
                    ? 'Switch'
                    : 'Agent pays'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Inline error / status for selected item */}
      {selected && (isPending || isConfirming || error) && (
        <div className="px-6 pb-4">
          <TxStatus
            hash={hash}
            isPending={isPending}
            isConfirming={isConfirming}
            isSuccess={false}
            error={error}
          />
        </div>
      )}

      {/* Receipt */}
      {receipt && (
        <div className="px-6 pb-5">
          <ReceiptCard receipt={receipt} onDismiss={() => { setReceipt(null); setSelected(null) }} />
        </div>
      )}

      {!address && (
        <div className="px-6 pb-4 text-xs text-slate-400 flex items-center gap-1.5">
          <Zap size={12} />
          Connect as the <strong className="text-slate-600">agent</strong> wallet to purchase.
        </div>
      )}
    </div>
  )
}

// ── Owner Controls Panel ──────────────────────────────────────────────────────
function OwnerPanel({
  isPaused,
  refetch,
}: {
  isPaused: boolean
  refetch: () => void
}) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [perTx, setPerTx] = useState('')
  const [daily, setDaily] = useState('')
  const [expiryDays, setExpiryDays] = useState('365')
  const isWrongChain = chainId !== CHAIN_ID

  const ensureChain = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return false }
    return true
  }, [isWrongChain, switchChain])

  const { writeContract: writePause, data: pauseHash, isPending: pausePending, error: pauseError, reset: pauseReset } = useWriteContract()
  const { isLoading: pauseConfirming, isSuccess: pauseSuccess } = useWaitForTransactionReceipt({ hash: pauseHash })

  const handleTogglePause = useCallback(() => {
    if (!address || !ensureChain()) return
    pauseReset()
    writePause({
      address: CONTRACT_ADDRESS,
      abi: AGENT_ALLOWANCE_ABI,
      functionName: isPaused ? 'unpause' : 'pause',
      chainId: CHAIN_ID,
    })
  }, [address, isPaused, writePause, pauseReset, ensureChain])

  const { writeContract: writeLimits, data: limitsHash, isPending: limitsPending, error: limitsError, reset: limitsReset } = useWriteContract()
  const { isLoading: limitsConfirming, isSuccess: limitsSuccess } = useWaitForTransactionReceipt({ hash: limitsHash })

  const handleSetLimits = useCallback(() => {
    if (!address || !ensureChain()) return
    limitsReset()
    if (!perTx || !daily || isNaN(Number(perTx)) || isNaN(Number(daily))) {
      toast.error('Enter valid cap amounts.')
      return
    }
    const ptcRaw = parseUnits(perTx, USDC_DECIMALS)
    const dcRaw = parseUnits(daily, USDC_DECIMALS)
    if (dcRaw < ptcRaw) { toast.error('Daily cap must be >= per-tx cap.'); return }
    const days = parseInt(expiryDays, 10)
    if (isNaN(days) || days < 1) { toast.error('Enter a valid number of days.'); return }
    const expiryTs = BigInt(Math.floor(Date.now() / 1000) + days * 86400)
    writeLimits({
      address: CONTRACT_ADDRESS,
      abi: AGENT_ALLOWANCE_ABI,
      functionName: 'setLimits',
      args: [ptcRaw, dcRaw, expiryTs],
      chainId: CHAIN_ID,
    })
  }, [address, perTx, daily, expiryDays, writeLimits, limitsReset, ensureChain])

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-white/80 shadow-sm space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Settings size={18} className="text-slate-500" />
        <h3 className="font-semibold text-slate-800">Owner Controls</h3>
      </div>

      <div>
        <button
          onClick={handleTogglePause}
          disabled={pausePending || pauseConfirming || !address}
          className={`w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
            ${isPaused
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
            }`}
        >
          {isPaused
            ? <><PlayCircle size={16} /> Resume Spending</>
            : <><PauseCircle size={16} /> Pause Spending</>
          }
        </button>
        <TxStatus hash={pauseHash} isPending={pausePending} isConfirming={pauseConfirming} isSuccess={pauseSuccess} error={pauseError} />
        {pauseSuccess && (
          <button onClick={() => { refetch() }} className="text-xs text-indigo-500 underline hover:text-indigo-700 mt-1">Refresh</button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Update Limits</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Per-tx cap (USDC)</label>
            <input
              type="number" min="0" step="0.01"
              value={perTx}
              onChange={e => setPerTx(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="10.00"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Daily cap (USDC)</label>
            <input
              type="number" min="0" step="0.01"
              value={daily}
              onChange={e => setDaily(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="50.00"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Expiry (days from now)</label>
          <input
            type="number" min="1"
            value={expiryDays}
            onChange={e => setExpiryDays(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <button
          onClick={handleSetLimits}
          disabled={limitsPending || limitsConfirming || !address}
          className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all bg-slate-800 text-white hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {limitsPending ? 'Confirm…' : limitsConfirming ? 'Confirming…' : 'Update Limits'}
        </button>
        <TxStatus hash={limitsHash} isPending={limitsPending} isConfirming={limitsConfirming} isSuccess={limitsSuccess} error={limitsError} />
        {limitsSuccess && (
          <button onClick={() => { refetch() }} className="text-xs text-indigo-500 underline hover:text-indigo-700">Refresh</button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          To revoke agent access: call{' '}
          <code className="bg-slate-100 px-1 rounded font-mono text-[11px]">USDC.approve(contract, 0)</code>{' '}
          from the owner wallet. No on-chain function needed.
        </p>
      </div>
    </div>
  )
}

// ── USDC Approve Panel ────────────────────────────────────────────────────────
function ApprovePanel() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [approveAmt, setApproveAmt] = useState('')

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isWrongChain = chainId !== CHAIN_ID

  const handleApprove = useCallback(() => {
    if (!address) return
    reset()
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    const raw = approveAmt === ''
      ? BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      : parseUnits(approveAmt, USDC_DECIMALS)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, raw],
      chainId: CHAIN_ID,
    })
  }, [address, approveAmt, isWrongChain, switchChain, writeContract, reset])

  return (
    <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-white/80 shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield size={18} className="text-teal-500" />
        <h3 className="font-semibold text-slate-800">Approve USDC to Contract</h3>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        The contract pulls USDC from the <strong>owner</strong> wallet via transferFrom. The owner must approve the contract first.
        Leave blank to approve max (unlimited).
      </p>
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Amount (blank = unlimited)</label>
        <div className="relative">
          <input
            type="number" min="0" step="0.01"
            value={approveAmt}
            onChange={e => setApproveAmt(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-20 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-300"
            placeholder="Unlimited"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 flex items-center gap-1">
            <TokenUSDC variant="branded" size={14} /> USDC
          </span>
        </div>
      </div>
      <button
        onClick={handleApprove}
        disabled={isPending || isConfirming || !address}
        className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isWrongChain ? 'Switch to Arc Testnet' : isPending ? 'Confirm…' : isConfirming ? 'Confirming…' : 'Approve USDC'}
      </button>
      <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
    </div>
  )
}

// Stable timestamp captured at module load
const NOW_MS = Date.now()

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { address } = useAccount()

  const { data: owner, refetch: r1 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'owner', chainId: CHAIN_ID })
  const { data: agent, refetch: r2 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'agent', chainId: CHAIN_ID })
  const { data: perTxCap, refetch: r3 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'perTxCap', chainId: CHAIN_ID })
  const { data: dailyCap, refetch: r4 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'dailyCap', chainId: CHAIN_ID })
  const { data: expiry, refetch: r5 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'expiry', chainId: CHAIN_ID })
  const { data: isPaused, refetch: r6 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'paused', chainId: CHAIN_ID })
  const { data: spentToday, refetch: r7 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'spentToday', chainId: CHAIN_ID })
  const { data: remainingToday, refetch: r8 } = useReadContract({ address: CONTRACT_ADDRESS, abi: AGENT_ALLOWANCE_ABI, functionName: 'remainingToday', chainId: CHAIN_ID })
  const { data: ownerAllowance, refetch: r9 } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
    args: owner ? [owner, CONTRACT_ADDRESS] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!owner },
  })

  const refetchAll = useCallback(() => {
    void r1(); void r2(); void r3(); void r4(); void r5(); void r6(); void r7(); void r8(); void r9()
  }, [r1, r2, r3, r4, r5, r6, r7, r8, r9])

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase()
  const isAgent = address && agent && address.toLowerCase() === agent.toLowerCase()

  const usedPct = (spentToday !== undefined && dailyCap !== undefined && dailyCap > 0n)
    ? Number((spentToday * 100n) / dailyCap)
    : 0

  const expiryMs = expiry ? Number(expiry) * 1000 : 0
  const isExpired = expiryMs > 0 && NOW_MS > expiryMs
  const daysLeft = expiryMs > 0 ? Math.max(0, Math.ceil((expiryMs - NOW_MS) / 86400000)) : 0

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-100 via-indigo-50 to-slate-100 font-[DM_Sans,sans-serif]">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/70 border-b border-white/60">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none">SingIt Allowance</h1>
              <p className="text-[10px] text-slate-400 font-mono">{CONTRACT_ADDRESS.slice(0, 10)}…</p>
            </div>
          </div>
          <ConnectKitButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Status Banner */}
        {(isPaused || isExpired) && (
          <div className={`rounded-2xl px-5 py-3 flex items-center gap-3 ${isPaused ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
            <AlertCircle size={18} />
            <span className="font-semibold text-sm">
              {isPaused ? 'Spending is currently paused.' : 'This allowance has expired.'}
            </span>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Remaining Today" value={`$${fmt(remainingToday)}`} sub="USDC available" />
          <StatCard label="Spent Today" value={`$${fmt(spentToday)}`} sub={`of $${fmt(dailyCap)} daily cap`} />
          <StatCard label="Per-Tx Limit" value={`$${fmt(perTxCap)}`} sub="max per payment" />
          <StatCard
            label="Expires"
            value={isExpired ? 'Expired' : `${daysLeft}d`}
            sub={fmtDate(expiry)}
          />
        </div>

        {/* Daily budget bar */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/80 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-slate-500 font-medium">
              <TrendingDown size={14} />
              Daily budget used
            </span>
            <span className="tabular-nums font-semibold text-slate-700">
              ${fmt(spentToday)} / ${fmt(dailyCap)}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${usedPct >= 90 ? 'bg-rose-400' : usedPct >= 60 ? 'bg-amber-400' : 'bg-indigo-500'}`}
              style={{ width: `${Math.min(usedPct, 100)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 tabular-nums">{usedPct}% used today</p>
        </div>

        {/* Roles */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/80">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Owner</p>
            <p className="font-mono text-slate-700 text-xs break-all">{owner ? fmtAddr(owner) : '—'}</p>
            {isOwner && <span className="text-[10px] text-indigo-600 font-semibold">You</span>}
          </div>
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/80">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Agent</p>
            <p className="font-mono text-slate-700 text-xs break-all">{agent ? fmtAddr(agent) : '—'}</p>
            {isAgent && <span className="text-[10px] text-indigo-600 font-semibold">You</span>}
          </div>
        </div>

        {/* USDC Allowance */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-3 border border-white/80 text-sm flex items-center justify-between">
          <span className="text-slate-500 flex items-center gap-1.5">
            <TokenUSDC variant="branded" size={16} />
            Owner USDC allowance to contract
          </span>
          <span className="tabular-nums font-semibold text-slate-800">
            {ownerAllowance !== undefined
              ? ownerAllowance >= BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') / 2n
                ? 'Unlimited'
                : `$${fmt(ownerAllowance)}`
              : '—'}
          </span>
        </div>

        {/* Demo Shop — always visible */}
        <DemoShopPanel
          refetch={refetchAll}
          remainingToday={remainingToday}
          perTxCap={perTxCap}
        />

        {/* Action panels — wallet-gated */}
        {!address ? (
          <div className="text-center py-8 text-slate-400">
            <p className="mb-4 text-sm">Connect your wallet to approve USDC or manage limits.</p>
            <ConnectKitButton label="Connect Wallet" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <ApprovePanel />
            <div>
              {isOwner
                ? <OwnerPanel isPaused={!!isPaused} refetch={refetchAll} />
                : (
                  <div className="bg-white/60 backdrop-blur-sm rounded-2xl px-5 py-4 border border-white/80 text-sm text-slate-400 flex items-center gap-2">
                    <Settings size={16} className="text-slate-300" />
                    Connect as the <strong className="text-slate-600">owner</strong> wallet to manage limits.
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Explorer link */}
        <div className="flex justify-center pt-2">
          <a
            href={`https://explorer.testnet.arc.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 transition-colors"
          >
            <ExternalLink size={11} />
            View contract on Arc Testnet explorer
          </a>
        </div>
      </main>
    </div>
  )
}
