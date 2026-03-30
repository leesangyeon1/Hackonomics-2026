import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import FloatingLines from './FloatingLines.jsx'
import GradientText from './GradientText.jsx'
import GridScan from './GridScan.jsx'
import MagicBento from './MagicBento.jsx'
import BorderGlow from './BorderGlow.jsx'
import Prism from './Prism.jsx'
import SplitText from './SplitText.jsx'

const LOAN_COLORS = ['#4bd1ff', '#57a6ff', '#67f39b', '#ec9bff', '#ffd166', '#ff7b7b']
const LOANS_STORAGE_KEY = 'finance-web-loans-v1'
const SPENDING_STORAGE_KEY = 'finance-web-spending-v1'
const INVESTING_STORAGE_KEY = 'finance-web-investing-v1'
const LEDGER_STORAGE_KEY = 'finance-web-ledger-v1'
const AI_KEY_STORAGE_KEY = 'finance-web-ai-key'

function formatMoney(value) {
  return `$${Number(value).toLocaleString()}`
}

function minimumPayment(loan) {
  return loan.amount * (loan.interest / 100 / 12)
}

function cannotPayOff(loan) {
  return loan.monthlyPayment <= minimumPayment(loan)
}

function calculateMonthlyPayment(amount, annualRate, months) {
  if (amount <= 0 || months <= 0 || annualRate < 0) return null
  const monthlyRate = annualRate / 100 / 12
  if (monthlyRate === 0) return amount / months
  const denominator = 1 - Math.pow(1 + monthlyRate, -months)
  if (denominator <= 0) return null
  return (amount * monthlyRate) / denominator
}

function calculateMonthsFromPayment(amount, annualRate, payment) {
  if (amount <= 0 || payment <= 0 || annualRate < 0) return null
  const monthlyRate = annualRate / 100 / 12
  if (monthlyRate === 0) return amount / payment
  const minRequired = amount * monthlyRate
  if (payment <= minRequired) return null
  const months = -Math.log(1 - (amount * monthlyRate) / payment) / Math.log(1 + monthlyRate)
  if (!Number.isFinite(months) || months <= 0) return null
  return months
}

function payoffMonth(loan) {
  let balance = loan.amount
  const monthlyRate = loan.interest / 100 / 12
  const horizon = Math.max(1, Math.ceil(loan.termMonths || 360))

  for (let i = 1; i <= horizon; i += 1) {
    balance = balance * (1 + monthlyRate) - loan.monthlyPayment
    if (balance <= 0) return i
  }

  return null
}

function generateSpots(loan) {
  let balance = loan.amount
  const monthlyRate = loan.interest / 100 / 12
  const spots = [{ month: 0, balance: Number(balance.toFixed(2)) }]
  const horizon = Math.max(1, Math.ceil(loan.termMonths || 360))

  for (let i = 1; i <= horizon; i += 1) {
    balance = balance * (1 + monthlyRate) - loan.monthlyPayment
    if (balance <= 0) {
      spots.push({ month: i, balance: 0 })
      break
    }
    spots.push({ month: i, balance: Number(balance.toFixed(2)) })
  }

  return spots
}

function balanceAtMonth(loan, month) {
  const spots = generateSpots(loan)
  let last = spots[0]
  for (const s of spots) {
    if (s.month > month) break
    last = s
  }
  return last.balance
}

function xInterval(maxX) {
  const candidates = [6, 12, 18, 24, 36, 48, 60]
  return candidates.find((c) => maxX / c <= 8) ?? 60
}

function calculateOptimization(loans, monthlyBudget) {
  const normalizedLoans = loans
    .map((loan) => {
      const principal = Number(loan.amount || 0)
      const rate = Number(loan.interest || 0)
      const minPayment = Number(loan.monthlyPayment || 0)
      return {
        id: loan.id,
        name: loan.name,
        balance: principal,
        monthlyRate: rate / 100 / 12,
        minPayment,
      }
    })
    .filter((loan) => loan.balance > 0 && loan.minPayment > 0)

  if (normalizedLoans.length === 0) {
    return { schedule: [], totalInterest: 0, payoffMonths: 0, totalPaid: 0 }
  }

  const totalMinPayment = normalizedLoans.reduce((sum, loan) => sum + loan.minPayment, 0)
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
    return { error: 'Enter a valid monthly budget for optimization.' }
  }
  if (monthlyBudget < totalMinPayment) {
    return {
      error: `Monthly budget must be at least ${formatMoney(totalMinPayment.toFixed(2))} to cover minimum payments.`,
    }
  }

  const initialPrincipal = normalizedLoans.reduce((sum, loan) => sum + loan.balance, 0)
  let totalInterestPaid = 0
  let month = 0
  const schedule = []

  while (normalizedLoans.some((loan) => loan.balance > 0.01) && month < 360) {
    month += 1
    let remainingBudget = monthlyBudget
    const row = { month, totalBalance: 0 }

    normalizedLoans.forEach((loan) => {
      const paymentKey = `loan_${loan.id}_payment`
      const balanceKey = `loan_${loan.id}_balance`

      if (loan.balance <= 0) {
        row[paymentKey] = 0
        row[balanceKey] = 0
        return
      }

      const interestCharge = loan.balance * loan.monthlyRate
      totalInterestPaid += interestCharge
      loan.balance += interestCharge

      const minPayment = Math.min(loan.minPayment, loan.balance)
      loan.balance -= minPayment
      remainingBudget -= minPayment
      row[paymentKey] = Number(minPayment.toFixed(2))
    })

    const activeLoans = normalizedLoans
      .filter((loan) => loan.balance > 0)
      .sort((a, b) => b.monthlyRate - a.monthlyRate)

    for (const loan of activeLoans) {
      if (remainingBudget <= 0) break
      const paymentKey = `loan_${loan.id}_payment`
      const extraPayment = Math.min(remainingBudget, loan.balance)
      loan.balance -= extraPayment
      remainingBudget -= extraPayment
      row[paymentKey] = Number(((row[paymentKey] || 0) + extraPayment).toFixed(2))
    }

    normalizedLoans.forEach((loan) => {
      const balanceKey = `loan_${loan.id}_balance`
      const safeBalance = Number(Math.max(0, loan.balance).toFixed(2))
      row[balanceKey] = safeBalance
      row.totalBalance += safeBalance
    })
    row.totalBalance = Number(row.totalBalance.toFixed(2))
    schedule.push(row)
  }

  const totalInterest = Number(totalInterestPaid.toFixed(2))
  const totalPaid = Number((initialPrincipal + totalInterest).toFixed(2))
  return { schedule, totalInterest, payoffMonths: month, totalPaid }
}

function SlotDigit({ digit }) {
  const target = Number(digit)
  const [position, setPosition] = useState(target)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    const randomStart = Math.floor(Math.random() * 10)
    setIsAnimating(false)
    setPosition(randomStart)

    const rafId = window.requestAnimationFrame(() => {
      setIsAnimating(true)
      // Move through one full cycle for a visible slot-reel effect.
      setPosition(target + 10)
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [target])

  return (
    <span className="slot-column">
      <span
        className={`slot-reel ${isAnimating ? 'spinning' : ''}`}
        style={{ '--slot-position': position }}
      >
        {Array.from({ length: 20 }, (_, n) => (
          <span key={n}>{n % 10}</span>
        ))}
      </span>
    </span>
  )
}

function SlotMachineAmount({ value, limit = Number.POSITIVE_INFINITY }) {
  const [animationSeed, setAnimationSeed] = useState(0)

  useEffect(() => {
    setAnimationSeed((prev) => prev + 1)
  }, [value])

  const formattedValue = useMemo(() => {
    const absAmount = Math.abs(Number(value || 0))
    const currency = `$${absAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return value < 0 ? `-${currency}` : currency
  }, [value])

  return (
    <span className={`slot-display ${value > limit ? 'over-budget' : ''}`}>
      {formattedValue.split('').map((char, index) => {
        if (/\d/.test(char)) {
          return <SlotDigit key={`${index}-${char}-${animationSeed}`} digit={char} />
        }
        return (
          <span key={`${index}-${char}-${animationSeed}`} className="slot-static">
            {char}
          </span>
        )
      })}
    </span>
  )
}

/* ──────── Combined Ledger Builder ──────── */
function buildLedger(loans, spendingData, investingData) {
  const entries = []
  const now = new Date().toISOString()

  loans.forEach((loan) => {
    entries.push({
      id: `loan-${loan.id}`,
      source: 'loan',
      category: 'Loan Payment',
      description: loan.name,
      amount: -loan.amount,
      monthlyPayment: loan.monthlyPayment,
      interest: loan.interest,
      termMonths: loan.termMonths,
      date: now,
    })
  })

  const categories = spendingData.categories || []
  categories.forEach((cat, i) => {
    const amt = Number(cat.amount || 0)
    if (amt > 0) {
      entries.push({
        id: `spend-${i}-${cat.name}`,
        source: 'spending',
        category: cat.name || 'Uncategorized',
        description: cat.name || 'Spending',
        amount: -amt,
        date: now,
      })
    }
  })

  const inc = Number(spendingData.income || 0)
  if (inc > 0) {
    entries.push({
      id: 'income-main',
      source: 'spending',
      category: 'Income',
      description: 'Monthly Income',
      amount: inc,
      date: now,
    })
  }

  const holdings = investingData.holdings || []
  holdings.forEach((h) => {
    const value = Number(h.shares || 0) * Number(h.price || 0)
    if (value > 0) {
      entries.push({
        id: `invest-${h.id}`,
        source: 'investing',
        category: 'Investment',
        description: `${h.ticker} (${h.shares} shares)`,
        amount: value,
        date: now,
      })
    }
  })

  if (Number(investingData.buyingPower || 0) > 0) {
    entries.push({
      id: 'invest-cash',
      source: 'investing',
      category: 'Cash',
      description: 'Buying Power',
      amount: Number(investingData.buyingPower),
      date: now,
    })
  }

  return entries
}

/* ──────── Dashboard Card ──────── */
function DashboardCard({ title, accent, metrics, onClick }) {
  return (
    <button className="dashboard-card glass-card" style={{ '--accent': accent }} onClick={onClick}>
      <div className="card-title">{title}</div>
      <div className="metrics-wrap">
        {Object.entries(metrics).map(([label, value]) => (
          <div key={label} className="metric-chip">
            <span className="metric-label">{label}</span>
            <span className="metric-value">{value}</span>
          </div>
        ))}
      </div>
    </button>
  )
}

/* ──────── Loans Page ──────── */
function LoansPage({ onBack, loans, setLoans }) {
  const [form, setForm] = useState({
    name: '',
    amount: '',
    interest: '',
    payment: '',
    months: '',
  })
  const lastLoanFieldRef = useRef(null)
  const [showCombined, setShowCombined] = useState(true)
  const [message, setMessage] = useState('')
  const [optimizationBudget, setOptimizationBudget] = useState('')

  const allGraphLoans = useMemo(
    () => loans.filter((loan) => loan.amount > 0 && loan.monthlyPayment > 0),
    [loans],
  )
  const chartLoans = useMemo(
    () =>
      loans.filter(
        (loan) => loan.amount > 0 && loan.monthlyPayment > 0 && loan.showOnChart !== false,
      ),
    [loans],
  )

  const maxX = useMemo(() => {
    if (allGraphLoans.length === 0) return 1
    return Math.max(
      ...allGraphLoans.map((loan) => {
        const spots = generateSpots(loan)
        return spots.at(-1)?.month ?? 1
      }),
      1,
    )
  }, [allGraphLoans])

  const chartRows = useMemo(() => {
    if (chartLoans.length === 0) return []
    const rows = []
    for (let m = 0; m <= maxX; m += 1) {
      const row = { month: m }
      chartLoans.forEach((loan) => {
        row[`loan_${loan.id}`] = Number(balanceAtMonth(loan, m).toFixed(2))
      })
      row.combinedAll = Number(
        allGraphLoans.reduce((sum, loan) => sum + balanceAtMonth(loan, m), 0).toFixed(2),
      )
      rows.push(row)
    }
    return rows
  }, [maxX, chartLoans, allGraphLoans])

  const maxY = useMemo(() => {
    if (chartRows.length === 0) return 100
    const peakBalances = chartRows.flatMap((row) =>
      chartLoans.map((loan) => Number(row[`loan_${loan.id}`] || 0)),
    )
    const combinedPeaks = showCombined ? chartRows.map((row) => Number(row.combinedAll || 0)) : []
    const rawMax = Math.max(...peakBalances, ...combinedPeaks, 100)
    return Math.ceil(rawMax * 1.1)
  }, [chartRows, chartLoans, showCombined])

  const updateForm = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'payment') lastLoanFieldRef.current = 'payment'
      if (field === 'months') lastLoanFieldRef.current = 'months'

      const amount = Number(next.amount)
      const interest = Number(next.interest)
      const payment = Number(next.payment)
      const months = Number(next.months)

      if (amount > 0 && interest >= 0) {
        const drive = lastLoanFieldRef.current
        if (field === 'amount' || field === 'interest') {
          if (drive === 'months' && months > 0) {
            const computedPayment = calculateMonthlyPayment(amount, interest, months)
            if (computedPayment) next.payment = computedPayment.toFixed(2)
          } else if (drive === 'payment' && payment > 0) {
            const computedMonths = calculateMonthsFromPayment(amount, interest, payment)
            if (computedMonths) next.months = String(Math.ceil(computedMonths))
          } else if (payment > 0) {
            const computedMonths = calculateMonthsFromPayment(amount, interest, payment)
            if (computedMonths) next.months = String(Math.ceil(computedMonths))
          } else if (months > 0) {
            const computedPayment = calculateMonthlyPayment(amount, interest, months)
            if (computedPayment) next.payment = computedPayment.toFixed(2)
          }
        } else if (drive === 'months' && months > 0) {
          const computedPayment = calculateMonthlyPayment(amount, interest, months)
          if (computedPayment) next.payment = computedPayment.toFixed(2)
        } else if (drive === 'payment' && payment > 0) {
          const computedMonths = calculateMonthsFromPayment(amount, interest, payment)
          if (computedMonths) next.months = String(Math.ceil(computedMonths))
        }
      }
      return next
    })
  }

  const addLoan = () => {
    const amount = Number(form.amount)
    const interest = Number(form.interest)
    let monthlyPayment = Number(form.payment)
    let termMonths = Number(form.months)

    if (amount <= 0 || interest < 0) {
      setMessage('Please enter valid loan amount and interest rate.')
      return
    }
    if (termMonths <= 0 && monthlyPayment > 0) {
      const computedMonths = calculateMonthsFromPayment(amount, interest, monthlyPayment)
      termMonths = computedMonths ? Math.ceil(computedMonths) : 0
    }
    if (monthlyPayment <= 0 && termMonths > 0) {
      const computedPayment = calculateMonthlyPayment(amount, interest, termMonths)
      monthlyPayment = computedPayment ?? 0
    }
    if (monthlyPayment <= 0 || termMonths <= 0) {
      setMessage('Enter either valid monthly payment or valid number of months.')
      return
    }

    const loan = {
      id: Date.now(),
      name: form.name.trim() || `Loan ${loans.length + 1}`,
      amount,
      interest,
      monthlyPayment: Number(monthlyPayment.toFixed(2)),
      termMonths: Math.ceil(termMonths),
      showOnChart: true,
    }
    if (cannotPayOff(loan)) {
      setMessage(
        `Payment is too low. Minimum payment needed: ${formatMoney(minimumPayment(loan).toFixed(2))} / month.`,
      )
      return
    }

    setMessage('')
    setLoans((prev) => [...prev, loan])
    setForm({ name: '', amount: '', interest: '', payment: '', months: '' })
    lastLoanFieldRef.current = null
  }

  const removeLoan = (id) => setLoans((prev) => prev.filter((loan) => loan.id !== id))
  const toggleChartForLoan = (id) => {
    setLoans((prev) =>
      prev.map((loan) =>
        loan.id === id ? { ...loan, showOnChart: loan.showOnChart === false } : loan,
      ),
    )
  }

  const optimizationLoans = useMemo(
    () =>
      loans.filter(
        (loan) =>
          Number(loan.amount || 0) > 0 &&
          Number(loan.interest || 0) >= 0 &&
          Number(loan.monthlyPayment || 0) > 0,
      ),
    [loans],
  )

  const optimizationMinimumBudget = useMemo(
    () =>
      optimizationLoans.reduce((sum, loan) => sum + Number(loan.monthlyPayment || 0), 0),
    [optimizationLoans],
  )

  useEffect(() => {
    if (optimizationLoans.length === 0) return
    if (optimizationBudget !== '') return
    const suggested = Math.ceil(optimizationMinimumBudget * 1.2)
    setOptimizationBudget(String(Math.max(suggested, 1)))
  }, [optimizationBudget, optimizationLoans.length, optimizationMinimumBudget])

  const optimizationResult = useMemo(
    () =>
      calculateOptimization(optimizationLoans, Number(optimizationBudget || 0)),
    [optimizationBudget, optimizationLoans],
  )

  return (
    <section>
      <button className="back-button ghost-btn" onClick={onBack}>
        &larr; Back
      </button>
      <h2 className="page-title">Loan Analyzer</h2>
      <div className="combined-toggle-row">
        <label className="chart-toggle-box">
          <input
            type="checkbox"
            checked={showCombined}
            onChange={(e) => setShowCombined(e.target.checked)}
          />
          Show combined graph (all loans)
        </label>
      </div>

      <div className="chart-shell glass-card">
        {allGraphLoans.length === 0 ? (
          <div className="empty-chart">Add a loan to see the chart</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartRows} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(130, 164, 210, 0.18)" />
              <XAxis
                dataKey="month"
                type="number"
                domain={[0, maxX]}
                interval={0}
                stroke="#84a7d4"
                ticks={Array.from({ length: Math.floor(maxX / xInterval(maxX)) + 1 }, (_, i) => i * xInterval(maxX))}
              />
              <YAxis
                stroke="#84a7d4"
                domain={[0, maxY]}
                tickFormatter={(value) => (value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`)}
              />
              <Tooltip
                contentStyle={{
                  background: '#081a31',
                  border: '1px solid rgba(86, 140, 204, 0.5)',
                  borderRadius: 8,
                  color: '#dbe8ff',
                }}
                formatter={(value) => formatMoney(value)}
                labelFormatter={(label) => `Month ${label}`}
              />
              {showCombined && (
                <Line
                  type="monotone"
                  dataKey="combinedAll"
                  name="Combined (all loans)"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="6 4"
                  isAnimationActive={false}
                />
              )}
              {chartLoans.map((loan, i) => (
                <Line
                  key={loan.id}
                  type="monotone"
                  dataKey={`loan_${loan.id}`}
                  name={loan.name}
                  stroke={LOAN_COLORS[i % LOAN_COLORS.length]}
                  strokeWidth={3}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {loans.length > 0 && (
        <>
          <h3>Your Loans</h3>
          <div className="loan-list">
            {loans.map((loan, i) => {
              const bad = cannotPayOff(loan)
              const payoff = payoffMonth(loan)
              return (
                <article key={loan.id} className="loan-card glass-card">
                  <div
                    className="loan-swatch"
                    style={{ backgroundColor: bad ? '#7b8799' : LOAN_COLORS[i % LOAN_COLORS.length] }}
                  />
                  <div className="loan-main">
                    <div>
                      <div className="loan-name">{loan.name}</div>
                      <div className="loan-sub">
                        {formatMoney(loan.amount)} &middot; {loan.interest}% APR &middot; {formatMoney(loan.monthlyPayment)}/mo &middot;{' '}
                        {loan.termMonths} months
                      </div>
                    </div>
                    <div className="loan-actions">
                      <label className="chart-toggle-box">
                        <input
                          type="checkbox"
                          checked={loan.showOnChart !== false}
                          onChange={() => toggleChartForLoan(loan.id)}
                        />
                        Show graph
                      </label>
                      <button className="small-btn" onClick={() => removeLoan(loan.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="loan-payoff">
                    Payoff: {payoff ? `${payoff} mo (${(payoff / 12).toFixed(1)} yr)` : 'Never'}
                  </div>
                  {bad && (
                    <div className="loan-warning">
                      Payment too low to cover interest. Minimum needed: {formatMoney(minimumPayment(loan).toFixed(2))}/mo
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}

      <h3>Add Loan</h3>
      <div className="loan-form glass-card">
        <input
          value={form.name}
          placeholder="Loan Name (optional)"
          onChange={(e) => updateForm('name', e.target.value)}
        />
        <div className="grid2">
          <input
            value={form.amount}
            placeholder="Loan Amount"
            onChange={(e) => updateForm('amount', e.target.value)}
          />
          <input
            value={form.interest}
            placeholder="Interest Rate %"
            onChange={(e) => updateForm('interest', e.target.value)}
          />
        </div>
        <div className="grid2">
          <input
            value={form.payment}
            placeholder="Monthly Payment"
            onChange={(e) => updateForm('payment', e.target.value)}
          />
          <input
            value={form.months}
            placeholder="Number of Months"
            onChange={(e) => updateForm('months', e.target.value)}
          />
        </div>
        <button className="primary-btn neon-btn" onClick={addLoan}>
          Add Loan
        </button>
        {message ? <p className="form-message">{message}</p> : null}
      </div>

      <h3>Optimize loan payment system</h3>
      <div className="glass-card loan-opt-shell">
        {optimizationLoans.length === 0 ? (
          <div className="empty-chart">Add loans first to run optimization.</div>
        ) : (
          <>
            <div className="loan-opt-kpis">
              <div className="loan-opt-kpi">
                <div className="loan-opt-label">Monthly Budget</div>
                <input
                  className="loan-opt-input"
                  type="number"
                  min={0}
                  value={optimizationBudget}
                  onChange={(e) => setOptimizationBudget(e.target.value)}
                />
                <div className="loan-opt-hint">
                  Minimum required: {formatMoney(optimizationMinimumBudget.toFixed(2))}
                </div>
              </div>

              <div className="loan-opt-kpi">
                <div className="loan-opt-label">Debt Free In</div>
                <div className="loan-opt-value good">
                  {optimizationResult.error
                    ? '--'
                    : `${Math.floor((optimizationResult.payoffMonths || 0) / 12)} yr ${(optimizationResult.payoffMonths || 0) % 12} mo`}
                </div>
              </div>

              <div className="loan-opt-kpi">
                <div className="loan-opt-label">Total Interest Paid</div>
                <div className="loan-opt-value bad">
                  {optimizationResult.error ? '--' : formatMoney((optimizationResult.totalInterest || 0).toFixed(2))}
                </div>
              </div>
            </div>

            {optimizationResult.error ? (
              <div className="loan-opt-error">{optimizationResult.error}</div>
            ) : (
              <div className="loan-opt-chart">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={optimizationResult.schedule} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      {optimizationLoans.map((loan, i) => (
                        <linearGradient key={loan.id} id={`optColor${loan.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={LOAN_COLORS[i % LOAN_COLORS.length]} stopOpacity={0.32} />
                          <stop offset="95%" stopColor={LOAN_COLORS[i % LOAN_COLORS.length]} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(130, 164, 210, 0.18)" />
                    <XAxis
                      dataKey="month"
                      stroke="#84a7d4"
                      tickFormatter={(value) => `M${value}`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#84a7d4"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${Math.round(value)}`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#081a31',
                        border: '1px solid rgba(86, 140, 204, 0.5)',
                        borderRadius: 8,
                        color: '#dbe8ff',
                      }}
                      formatter={(value, name) => [formatMoney(Number(value).toFixed(2)), String(name).replace('_balance', '')]}
                      labelFormatter={(label) => `Month ${label}`}
                    />
                    {optimizationLoans.map((loan, i) => (
                      <Area
                        key={loan.id}
                        type="monotone"
                        dataKey={`loan_${loan.id}_balance`}
                        name={`${loan.name} balance`}
                        stroke={LOAN_COLORS[i % LOAN_COLORS.length]}
                        fill={`url(#optColor${loan.id})`}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ──────── Spending Page ──────── */
function SpendingPage({ onBack, spendingData, setSpendingData }) {
  const income = Number(spendingData.income || 0)
  const categories = spendingData.categories || []

  const totalSpend = categories.reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0
  )

  const budget = Number(spendingData.budget || 0)

  const netIncome = income - totalSpend
  const savingsRate = income > 0 ? (netIncome / income) * 100 : 0
  const spendRatio = income > 0 ? (totalSpend / income) * 100 : 0
  const remaining = budget - totalSpend

  function updateCategory(index, value) {
    const updated = [...categories]
    updated[index].amount = value
    setSpendingData((prev) => ({
      ...prev,
      categories: updated,
    }))
  }

  function updateCategoryName(index, name) {
    const updated = [...categories]
    updated[index].name = name
    setSpendingData((prev) => ({
      ...prev,
      categories: updated,
    }))
  }

  function addCategory() {
    setSpendingData((prev) => ({
      ...prev,
      categories: [...categories, { name: "", amount: "" }],
    }))
  }

  function deleteCategory(index) {
    const updated = categories.filter((_, i) => i !== index)
    setSpendingData((prev) => ({
      ...prev,
      categories: updated,
    }))
  }

  function getInsight() {
    if (income === 0) return "Add income to begin tracking"
    if (totalSpend > income) return "Warning: You're losing money each month"
    if (spendRatio > 80) return "Warning: High spending ratio"
    if (spendRatio < 50) return "Great savings rate!"
    return "You're doing okay"
  }

  return (
    <section>
      <button className="back-button ghost-btn" onClick={onBack}>
        &larr; Back
      </button>

      <h2 className="page-title">Cash Flow</h2>

      <div className="spending-grid">
        <div className="glass-card spending-big">
          <div className="panel-head">
            <strong>Net Income</strong>
          </div>
          <div className="money">{formatMoney(netIncome.toFixed(2))}</div>
          <div className="muted">Income - Spend</div>
          <div style={{ marginTop: 12 }}>
            <div className="muted">{spendRatio.toFixed(1)}% spent</div>
            <div
              style={{
                height: 8,
                borderRadius: 6,
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${Math.min(spendRatio, 100)}%`,
                  height: "100%",
                  background:
                    spendRatio > 80
                      ? "#ef4444"
                      : spendRatio > 50
                      ? "#f59e0b"
                      : "#22c55e",
                }}
              />
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {getInsight()}
          </div>
        </div>

        <div className="glass-card panel">
          <div className="panel-head">
            <strong>Income</strong>
          </div>
          <div className="money">{formatMoney(income.toFixed(2))}</div>
          <input
            className="panel-input"
            type="number"
            placeholder="Income"
            value={spendingData.income}
            onChange={(e) =>
              setSpendingData((prev) => ({
                ...prev,
                income: e.target.value,
              }))
            }
          />
          <div className="row">
            <span>Savings Rate</span>
            <strong>{savingsRate.toFixed(1)}%</strong>
          </div>
        </div>

        <div className="glass-card panel">
          <div className="panel-head">
            <strong>Budget</strong>
          </div>
          <div className="money">{formatMoney(budget.toFixed(2))}</div>
          <input
            className="panel-input"
            type="number"
            placeholder="Monthly Budget"
            value={spendingData.budget || ""}
            onChange={(e) =>
              setSpendingData((prev) => ({
                ...prev,
                budget: e.target.value,
              }))
            }
          />
          <div className="row">
            <span>Remaining</span>
            <strong style={{ color: remaining < 0 ? "#ff6b6b" : "#59f69c" }}>
              {formatMoney(remaining.toFixed(2))}
            </strong>
          </div>
        </div>

        <div className="glass-card spending-big">
          <div className="panel-head">
            <strong>Spending Breakdown</strong>
          </div>
          {categories.map((c, i) => (
            <div className="category-row" key={i}>
              <input
                className="category-name"
                value={c.name}
                onChange={(e) => updateCategoryName(i, e.target.value)}
                placeholder="Category"
              />
              <input
                className="category-amount"
                type="number"
                value={c.amount}
                onChange={(e) => updateCategory(i, e.target.value)}
                placeholder="$0"
              />
              <button
                className="delete-btn"
                onClick={() => deleteCategory(i)}
              >
                X
              </button>
            </div>
          ))}
          <button className="add-category-btn" onClick={addCategory}>
            + Add Category
          </button>
          <div className="row" style={{ marginTop: 12 }}>
            <span>Total Spend</span>
            <strong>{formatMoney(totalSpend.toFixed(2))}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ──────── Robinhood-style Investing Page ──────── */
function InvestingPage({ onBack, investingData, setInvestingData }) {
  const [holdingForm, setHoldingForm] = useState({ ticker: '', shares: '', price: '', dailyChange: '' })
  const [activeTab, setActiveTab] = useState('1M')

  const holdings = investingData.holdings || []
  const buyingPower = Number(investingData.buyingPower || 0)

  const portfolioValue = holdings.reduce(
    (sum, h) => sum + Number(h.shares || 0) * Number(h.price || 0), 0
  ) + buyingPower

  const totalDailyChange = holdings.reduce(
    (sum, h) => sum + Number(h.dailyChange || 0) * Number(h.shares || 0), 0
  )

  const totalCostBasis = holdings.reduce(
    (sum, h) => sum + Number(h.costBasis || h.price) * Number(h.shares || 0), 0
  )
  const totalGainLoss = portfolioValue - buyingPower - totalCostBasis

  // Generate chart data simulating portfolio history
  const chartData = useMemo(() => {
    const points = []
    const days = activeTab === '1W' ? 7 : activeTab === '1M' ? 30 : activeTab === '3M' ? 90 : activeTab === 'YTD' ? 90 : activeTab === '1Y' ? 365 : 365
    const baseValue = portfolioValue * 0.92
    for (let i = 0; i <= days; i++) {
      const progress = i / days
      const noise = (Math.sin(i * 0.5) * 0.02 + Math.sin(i * 1.3) * 0.01) * baseValue
      const value = baseValue + (portfolioValue - baseValue) * progress + noise
      points.push({ day: i, value: Number(value.toFixed(2)) })
    }
    return points
  }, [portfolioValue, activeTab])

  const isPositive = totalDailyChange >= 0
  const accentColor = isPositive ? '#00C805' : '#FF5000'

  function addHolding() {
    if (!holdingForm.ticker.trim() || Number(holdingForm.shares) <= 0 || Number(holdingForm.price) <= 0) return
    const newHolding = {
      id: Date.now(),
      ticker: holdingForm.ticker.toUpperCase().trim(),
      shares: Number(holdingForm.shares),
      price: Number(holdingForm.price),
      costBasis: Number(holdingForm.price),
      dailyChange: Number(holdingForm.dailyChange || 0),
    }
    setInvestingData((prev) => ({
      ...prev,
      holdings: [...(prev.holdings || []), newHolding],
    }))
    setHoldingForm({ ticker: '', shares: '', price: '', dailyChange: '' })
  }

  function removeHolding(id) {
    setInvestingData((prev) => ({
      ...prev,
      holdings: (prev.holdings || []).filter((h) => h.id !== id),
    }))
  }

  function updateHoldingPrice(id, newPrice) {
    setInvestingData((prev) => ({
      ...prev,
      holdings: (prev.holdings || []).map((h) =>
        h.id === id ? { ...h, price: Number(newPrice) } : h
      ),
    }))
  }

  return (
    <section className="rh-page">
      <button className="back-button ghost-btn" onClick={onBack}>
        &larr; Back
      </button>

      {/* Portfolio Header */}
      <div className="rh-header">
        <div className="rh-label">Investing</div>
        <div className="rh-portfolio-value">{formatMoney(portfolioValue.toFixed(2))}</div>
        <div className={`rh-daily-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '+' : ''}{formatMoney(totalDailyChange.toFixed(2))} ({portfolioValue > 0 ? ((totalDailyChange / portfolioValue) * 100).toFixed(2) : '0.00'}%) Today
        </div>
      </div>

      {/* Portfolio Chart */}
      <div className="rh-chart-container">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={['dataMin', 'dataMax']} hide />
            <XAxis dataKey="day" hide />
            <Tooltip
              contentStyle={{
                background: '#1a1a2e',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
              }}
              formatter={(value) => [formatMoney(value), 'Portfolio']}
              labelFormatter={() => ''}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={accentColor}
              strokeWidth={2}
              fill="url(#portfolioGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Range Tabs */}
      <div className="rh-range-tabs">
        {['1W', '1M', '3M', 'YTD', '1Y', 'ALL'].map((tab) => (
          <button
            key={tab}
            className={`rh-tab ${tab === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            style={tab === activeTab ? { color: accentColor, borderBottomColor: accentColor } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Buying Power */}
      <div className="rh-section">
        <div className="rh-buying-power glass-card">
          <div className="rh-bp-row">
            <span>Buying Power</span>
            <span className="rh-bp-value">{formatMoney(buyingPower.toFixed(2))}</span>
          </div>
          <input
            className="rh-input"
            type="number"
            placeholder="Set buying power"
            value={investingData.buyingPower || ''}
            onChange={(e) => setInvestingData((prev) => ({ ...prev, buyingPower: e.target.value }))}
          />
        </div>
      </div>

      {/* Holdings */}
      <div className="rh-section">
        <div className="rh-section-header">
          <h3 className="rh-section-title">Holdings</h3>
          {holdings.length > 0 && (
            <span className="rh-total-gl" style={{ color: totalGainLoss >= 0 ? '#00C805' : '#FF5000' }}>
              {totalGainLoss >= 0 ? '+' : ''}{formatMoney(totalGainLoss.toFixed(2))} total
            </span>
          )}
        </div>

        {holdings.length === 0 ? (
          <div className="rh-empty">No holdings yet. Add your first stock below.</div>
        ) : (
          <div className="rh-holdings-list">
            {holdings.map((h) => {
              const marketValue = Number(h.shares) * Number(h.price)
              const costBasisTotal = Number(h.shares) * Number(h.costBasis || h.price)
              const gl = marketValue - costBasisTotal
              const glPct = costBasisTotal > 0 ? (gl / costBasisTotal) * 100 : 0
              const dailyPl = Number(h.dailyChange || 0) * Number(h.shares)
              const holdingPositive = gl >= 0

              return (
                <div key={h.id} className="rh-holding-card">
                  <div className="rh-holding-left">
                    <div className="rh-ticker">{h.ticker}</div>
                    <div className="rh-shares">{h.shares} share{h.shares !== 1 ? 's' : ''}</div>
                  </div>

                  <div className="rh-holding-chart-mini">
                    <svg viewBox="0 0 60 24" className="rh-mini-svg">
                      <polyline
                        fill="none"
                        stroke={holdingPositive ? '#00C805' : '#FF5000'}
                        strokeWidth="1.5"
                        points={Array.from({ length: 12 }, (_, i) => {
                          const base = 12
                          const trend = holdingPositive ? i * 0.8 : -i * 0.5
                          const noise = Math.sin(i * 2 + h.id) * 3
                          return `${i * 5.5},${base - trend + noise}`
                        }).join(' ')}
                      />
                    </svg>
                  </div>

                  <div className="rh-holding-right">
                    <div className="rh-holding-price">{formatMoney(Number(h.price).toFixed(2))}</div>
                    <div className={`rh-holding-change ${holdingPositive ? 'positive' : 'negative'}`}>
                      {holdingPositive ? '+' : ''}{glPct.toFixed(2)}%
                    </div>
                  </div>

                  <div className="rh-holding-details">
                    <div className="rh-detail-row">
                      <span>Market Value</span>
                      <span>{formatMoney(marketValue.toFixed(2))}</span>
                    </div>
                    <div className="rh-detail-row">
                      <span>Total Return</span>
                      <span style={{ color: gl >= 0 ? '#00C805' : '#FF5000' }}>
                        {gl >= 0 ? '+' : ''}{formatMoney(gl.toFixed(2))}
                      </span>
                    </div>
                    <div className="rh-detail-row">
                      <span>Today</span>
                      <span style={{ color: dailyPl >= 0 ? '#00C805' : '#FF5000' }}>
                        {dailyPl >= 0 ? '+' : ''}{formatMoney(dailyPl.toFixed(2))}
                      </span>
                    </div>
                    <div className="rh-holding-actions">
                      <input
                        className="rh-input rh-price-input"
                        type="number"
                        placeholder="Update price"
                        onBlur={(e) => {
                          if (e.target.value) updateHoldingPrice(h.id, e.target.value)
                          e.target.value = ''
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value) {
                            updateHoldingPrice(h.id, e.target.value)
                            e.target.value = ''
                          }
                        }}
                      />
                      <button className="rh-sell-btn" onClick={() => removeHolding(h.id)}>
                        Sell All
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Holding */}
      <div className="rh-section">
        <h3 className="rh-section-title">Add Holding</h3>
        <div className="rh-add-form glass-card">
          <div className="rh-form-grid">
            <input
              className="rh-input"
              value={holdingForm.ticker}
              placeholder="Ticker (e.g. AAPL)"
              onChange={(e) => setHoldingForm((p) => ({ ...p, ticker: e.target.value }))}
            />
            <input
              className="rh-input"
              type="number"
              value={holdingForm.shares}
              placeholder="Shares"
              onChange={(e) => setHoldingForm((p) => ({ ...p, shares: e.target.value }))}
            />
            <input
              className="rh-input"
              type="number"
              value={holdingForm.price}
              placeholder="Price per share"
              onChange={(e) => setHoldingForm((p) => ({ ...p, price: e.target.value }))}
            />
            <input
              className="rh-input"
              type="number"
              value={holdingForm.dailyChange}
              placeholder="Daily change ($)"
              onChange={(e) => setHoldingForm((p) => ({ ...p, dailyChange: e.target.value }))}
            />
          </div>
          <button className="rh-buy-btn" onClick={addHolding}>Buy</button>
        </div>
      </div>
    </section>
  )
}

/* ──────── Financial Planner Page ──────── */
function FinancialPlannerPage({ onBack, loans, spendingData, investingData, ledger }) {
  const [apiKey, setApiKey] = useState(() => {
    try { return window.localStorage.getItem(AI_KEY_STORAGE_KEY) || '' } catch { return '' }
  })
  const [advice, setAdvice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    try { window.localStorage.setItem(AI_KEY_STORAGE_KEY, apiKey) } catch { /* ignore */ }
  }, [apiKey])

  const analyzeFinances = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter your Anthropic API key.')
      return
    }

    setLoading(true)
    setError('')
    setAdvice('')

    const income = Number(spendingData.income || 0)
    const categories = spendingData.categories || []
    const totalSpend = categories.reduce((s, c) => s + Number(c.amount || 0), 0)
    const holdings = investingData.holdings || []
    const portfolioValue = holdings.reduce((s, h) => s + Number(h.shares || 0) * Number(h.price || 0), 0) + Number(investingData.buyingPower || 0)
    const totalLoans = loans.reduce((s, l) => s + Number(l.amount || 0), 0)
    const monthlyLoanPayments = loans.reduce((s, l) => s + Number(l.monthlyPayment || 0), 0)

    const prompt = `You are a certified financial planner. Analyze this person's financial situation and provide detailed, actionable advice.

FINANCIAL SNAPSHOT:
===================
INCOME & SPENDING:
- Monthly Income: $${income.toFixed(2)}
- Monthly Spending: $${totalSpend.toFixed(2)}
- Budget: $${Number(spendingData.budget || 0).toFixed(2)}
- Net Monthly Cash Flow: $${(income - totalSpend).toFixed(2)}
- Savings Rate: ${income > 0 ? ((income - totalSpend) / income * 100).toFixed(1) : 0}%
- Spending Categories: ${categories.length > 0 ? categories.map(c => `${c.name}: $${Number(c.amount || 0).toFixed(2)}`).join(', ') : 'None tracked'}

LOANS & DEBT:
- Total Debt: $${totalLoans.toFixed(2)}
- Monthly Loan Payments: $${monthlyLoanPayments.toFixed(2)}
- Number of Loans: ${loans.length}
${loans.map(l => `  - ${l.name}: $${l.amount.toFixed(2)} at ${l.interest}% APR, $${l.monthlyPayment.toFixed(2)}/mo, ${l.termMonths} months`).join('\n')}

INVESTMENTS:
- Portfolio Value: $${portfolioValue.toFixed(2)}
- Buying Power (Cash): $${Number(investingData.buyingPower || 0).toFixed(2)}
- Holdings: ${holdings.length > 0 ? holdings.map(h => `${h.ticker}: ${h.shares} shares @ $${Number(h.price).toFixed(2)}`).join(', ') : 'None'}

COMBINED LEDGER SUMMARY:
- Total Assets: $${(portfolioValue).toFixed(2)}
- Total Liabilities: $${totalLoans.toFixed(2)}
- Net Worth: $${(portfolioValue - totalLoans).toFixed(2)}

Please provide:
1. FINANCIAL HEALTH SCORE (1-100) with brief explanation
2. TOP 3 IMMEDIATE ACTIONS to improve their finances
3. SPENDING ANALYSIS - patterns, concerns, and optimization suggestions
4. DEBT STRATEGY - best approach to pay off loans (avalanche vs snowball recommendation)
5. INVESTMENT RECOMMENDATIONS - portfolio diversification, risk assessment
6. 6-MONTH FINANCIAL PLAN with monthly milestones
7. EMERGENCY FUND STATUS and recommendation

Be specific with dollar amounts and percentages. Keep advice practical and actionable.`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!response.ok) {
        const errBody = await response.text()
        throw new Error(`API Error (${response.status}): ${errBody}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || 'No response received.'
      setAdvice(text)
    } catch (err) {
      setError(err.message || 'Failed to get advice. Check your API key.')
    } finally {
      setLoading(false)
    }
  }, [apiKey, loans, spendingData, investingData])

  // Simple markdown-ish rendering
  function renderAdvice(text) {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h2 key={i} className="fp-heading">{line.slice(2)}</h2>
      if (line.startsWith('## ')) return <h3 key={i} className="fp-subheading">{line.slice(3)}</h3>
      if (line.startsWith('### ')) return <h4 key={i} className="fp-subheading2">{line.slice(4)}</h4>
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="fp-bold">{line.slice(2, -2)}</p>
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="fp-list-item">{line.slice(2)}</li>
      if (line.match(/^\d+\.\s/)) return <li key={i} className="fp-list-item fp-numbered">{line}</li>
      if (line.trim() === '') return <br key={i} />
      return <p key={i} className="fp-paragraph">{line}</p>
    })
  }

  return (
    <section className="fp-page">
      <button className="back-button ghost-btn" onClick={onBack}>
        &larr; Back
      </button>
      <h2 className="page-title">Financial Planner</h2>
      <p className="muted">AI-powered analysis of your spending, loans, and investments</p>

      {/* API Key Input */}
      <div className="glass-card fp-key-card">
        <div className="fp-key-header">
          <strong>Anthropic API Key</strong>
          <button className="ghost-btn fp-toggle-key" onClick={() => setShowKey(!showKey)}>
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          className="rh-input fp-key-input"
          type={showKey ? 'text' : 'password'}
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button
          className={`neon-btn fp-analyze-btn ${loading ? 'loading' : ''}`}
          onClick={analyzeFinances}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Analyze My Finances'}
        </button>
        {error && <p className="form-message">{error}</p>}
      </div>

      {/* Quick Summary Cards */}
      <div className="fp-summary-grid">
        <div className="glass-card fp-mini-card">
          <div className="fp-mini-label">Net Worth</div>
          <div className="fp-mini-value" style={{
            color: (
              (investingData.holdings || []).reduce((s, h) => s + Number(h.shares || 0) * Number(h.price || 0), 0)
              + Number(investingData.buyingPower || 0)
              - loans.reduce((s, l) => s + Number(l.amount || 0), 0)
            ) >= 0 ? '#00C805' : '#FF5000'
          }}>
            {formatMoney((
              (investingData.holdings || []).reduce((s, h) => s + Number(h.shares || 0) * Number(h.price || 0), 0)
              + Number(investingData.buyingPower || 0)
              - loans.reduce((s, l) => s + Number(l.amount || 0), 0)
            ).toFixed(2))}
          </div>
        </div>
        <div className="glass-card fp-mini-card">
          <div className="fp-mini-label">Monthly Cash Flow</div>
          <div className="fp-mini-value" style={{
            color: (Number(spendingData.income || 0) - (spendingData.categories || []).reduce((s, c) => s + Number(c.amount || 0), 0)) >= 0 ? '#00C805' : '#FF5000'
          }}>
            {formatMoney((Number(spendingData.income || 0) - (spendingData.categories || []).reduce((s, c) => s + Number(c.amount || 0), 0)).toFixed(2))}
          </div>
        </div>
        <div className="glass-card fp-mini-card">
          <div className="fp-mini-label">Total Debt</div>
          <div className="fp-mini-value" style={{ color: '#FF5000' }}>
            {formatMoney(loans.reduce((s, l) => s + Number(l.amount || 0), 0).toFixed(2))}
          </div>
        </div>
        <div className="glass-card fp-mini-card">
          <div className="fp-mini-label">Investments</div>
          <div className="fp-mini-value" style={{ color: '#00C805' }}>
            {formatMoney((
              (investingData.holdings || []).reduce((s, h) => s + Number(h.shares || 0) * Number(h.price || 0), 0)
              + Number(investingData.buyingPower || 0)
            ).toFixed(2))}
          </div>
        </div>
      </div>

      {/* Ledger Overview */}
      <div className="glass-card fp-ledger-card">
        <h3 className="rh-section-title">Combined Ledger</h3>
        <div className="fp-ledger-list">
          {ledger.length === 0 ? (
            <div className="rh-empty">Add data to Loans, Spending, or Investing to see your ledger.</div>
          ) : (
            ledger.map((entry) => (
              <div key={entry.id} className="fp-ledger-row">
                <div className="fp-ledger-left">
                  <span className={`fp-source-badge fp-source-${entry.source}`}>{entry.source}</span>
                  <span className="fp-ledger-desc">{entry.description}</span>
                </div>
                <span className={`fp-ledger-amount ${entry.amount >= 0 ? 'positive' : 'negative'}`}>
                  {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount.toFixed(2))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* AI Advice */}
      {advice && (
        <div className="glass-card fp-advice-card">
          <h3 className="rh-section-title">AI Financial Advice</h3>
          <div className="fp-advice-body">
            {renderAdvice(advice)}
          </div>
        </div>
      )}
    </section>
  )
}

/* ──────── Dashboard Page ──────── */
function DashboardPage({ onNavigate, totalEarnings, estimatedSavings, breakdown, cards }) {
  const bentoCards = useMemo(
    () =>
      cards.map((card) => ({
        title:
          card.page === 'loans'
            ? 'Loans'
            : card.page === 'investing'
              ? 'Invest'
              : card.page === 'spending'
                ? 'Cashflow'
                : 'Finance advice',
        metrics: Object.entries(card.metrics).map(([label, value]) => ({ label, value })),
        accent: card.accent,
        onClick: () => onNavigate(card.page || card.title.toLowerCase()),
      })),
    [cards, onNavigate],
  )

  return (
    <section className="dashboard-page">
      <div className="dashboard-top-card">
        <BorderGlow
          edgeSensitivity={46}
          glowColor="40 80 80"
          backgroundColor="#060010"
          borderRadius={33}
          glowRadius={40}
          glowIntensity={1}
          coneSpread={25}
          animated={false}
          colors={['#c084fc', '#f472b6', '#38bdf8']}
          className="dashboard-earnings-glow"
        >
          <div className="earnings-card glass-card">
            <div className="earnings-main-row">
              <span>Estimated Monthly Savings</span>
              <strong>
                <SlotMachineAmount value={estimatedSavings} />
              </strong>
            </div>
            <div className="earnings-breakdown">
              <div className="breakdown-item">
                <span className="breakdown-label">Cash Flow</span>
                <span className={`breakdown-value ${breakdown.cashFlow >= 0 ? 'pos' : 'neg'}`}>
                  {breakdown.cashFlow >= 0 ? '+' : ''}{formatMoney(breakdown.cashFlow.toFixed(2))}
                </span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Loan Payments</span>
                <span className="breakdown-value neg">
                  -{formatMoney(breakdown.loanPayments.toFixed(2))}
                </span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Invest Gains (est/mo)</span>
                <span className={`breakdown-value ${breakdown.investGainsMonthly >= 0 ? 'pos' : 'neg'}`}>
                  {breakdown.investGainsMonthly >= 0 ? '+' : ''}{formatMoney(breakdown.investGainsMonthly.toFixed(2))}
                </span>
              </div>
            </div>
          </div>
        </BorderGlow>
      </div>
      <div className="cards-list">
        <MagicBento
          items={bentoCards}
          textAutoHide
          enableStars
          enableSpotlight
          enableBorderGlow
          enableTilt={false}
          enableMagnetism={false}
          clickEffect
          spotlightRadius={400}
          particleCount={12}
          glowColor="87, 166, 240"
          disableAnimations={false}
        />
      </div>
      <div className="dashboard-footer">
        <BorderGlow
          edgeSensitivity={46}
          glowColor="40 80 80"
          backgroundColor="#060010"
          borderRadius={33}
          glowRadius={40}
          glowIntensity={1}
          coneSpread={25}
          animated={false}
          colors={['#c084fc', '#f472b6', '#38bdf8']}
          className="dashboard-earnings-glow"
        >
          <div className="earnings-card glass-card dashboard-footer-card">
            <div className="earnings-main-row">
              <span>Net Worth</span>
              <strong className={totalEarnings >= 0 ? '' : 'over-budget'}>
                <SlotMachineAmount value={totalEarnings} />
              </strong>
            </div>
            <div className="earnings-breakdown">
              <div className="breakdown-item">
                <span className="breakdown-label">Investments</span>
                <span className="breakdown-value pos">
                  +{formatMoney(breakdown.investingTotal.toFixed(2))}
                </span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Income - Spending</span>
                <span className={`breakdown-value ${breakdown.cashFlow >= 0 ? 'pos' : 'neg'}`}>
                  {breakdown.cashFlow >= 0 ? '+' : ''}{formatMoney(breakdown.cashFlow.toFixed(2))}
                </span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-label">Total Debt</span>
                <span className="breakdown-value neg">
                  -{formatMoney(breakdown.totalDebt.toFixed(2))}
                </span>
              </div>
            </div>
          </div>
        </BorderGlow>
      </div>
    </section>
  )
}

/* ──────── App ──────── */
function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [loans, setLoans] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = window.localStorage.getItem(LOANS_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [spendingData, setSpendingData] = useState(() => {
    if (typeof window === 'undefined') return { income: '', spend: '' }
    try {
      const saved = window.localStorage.getItem(SPENDING_STORAGE_KEY)
      return saved ? JSON.parse(saved) : { income: '', spend: '' }
    } catch {
      return { income: '', spend: '' }
    }
  })
  const [investingData, setInvestingData] = useState(() => {
    if (typeof window === 'undefined') return { holdings: [], buyingPower: '' }
    try {
      const saved = window.localStorage.getItem(INVESTING_STORAGE_KEY)
      return saved ? JSON.parse(saved) : { holdings: [], buyingPower: '' }
    } catch {
      return { holdings: [], buyingPower: '' }
    }
  })
  const handleTitleAnimationComplete = useCallback(() => {
    // Intentionally empty; keeps SplitText callback contract for future hooks.
  }, [])

  // Build combined ledger from all data sources
  const ledger = useMemo(
    () => buildLedger(loans, spendingData, investingData),
    [loans, spendingData, investingData],
  )

  const spendingIncome = Number(spendingData.income || 0)
  const spendingCategories = spendingData.categories || []
  const totalSpend = spendingCategories.reduce((s, c) => s + Number(c.amount || 0), 0)
  const spendingNet = spendingIncome - totalSpend

  const holdings = investingData.holdings || []
  const investingValue = holdings.reduce(
    (sum, h) => sum + Number(h.shares || 0) * Number(h.price || 0), 0
  ) + Number(investingData.buyingPower || 0)

  const totalLoanDue = loans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0)
  const activeLoans = loans.length
  const chartVisibleLoans = loans.filter((loan) => loan.showOnChart !== false).length
  // Monthly loan payments going toward principal (building equity)
  const monthlyLoanPayments = loans.reduce((s, l) => s + Number(l.monthlyPayment || 0), 0)
  const monthlyInterestCost = loans.reduce((s, l) => s + minimumPayment(l), 0)
  const monthlyPrincipalPaid = Math.max(0, monthlyLoanPayments - monthlyInterestCost)

  // Investment gains (unrealized)
  const totalCostBasis = holdings.reduce(
    (s, h) => s + Number(h.costBasis || h.price) * Number(h.shares || 0), 0
  )
  const investmentGains = investingValue - Number(investingData.buyingPower || 0) - totalCostBasis

  // Combined total: net worth = assets - liabilities
  const totalEarnings = investingValue + spendingNet - totalLoanDue

  // Estimated savings: cash flow after ALL obligations
  // = income - spending - loan payments + investment daily gains
  const totalDailyGainMonthly = holdings.reduce(
    (s, h) => s + Number(h.dailyChange || 0) * Number(h.shares || 0), 0
  ) * 30
  const estimatedSavings = Math.max(0, spendingNet - monthlyLoanPayments + totalDailyGainMonthly)

  const totalDailyChange = holdings.reduce(
    (sum, h) => sum + Number(h.dailyChange || 0) * Number(h.shares || 0), 0
  )

  const cards = useMemo(
    () => [
      {
        title: 'Loans',
        accent: '#57a6ff',
        page: 'loans',
        metrics: {
          'Active Loans': String(activeLoans),
          'Shown on Graph': String(chartVisibleLoans),
          'Total Due': formatMoney(totalLoanDue.toFixed(2)),
        },
      },
      {
        title: 'Investing',
        accent: '#00C805',
        page: 'investing',
        metrics: {
          'Portfolio': formatMoney(investingValue.toFixed(2)),
          'Holdings': String(holdings.length),
          "Today's P/L": `${totalDailyChange >= 0 ? '+' : ''}${formatMoney(totalDailyChange.toFixed(2))}`,
        },
      },
      {
        title: 'Spending',
        accent: '#67f39b',
        page: 'spending',
        metrics: {
          Income: formatMoney(spendingIncome.toFixed(2)),
          Spend: formatMoney(totalSpend.toFixed(2)),
          Net: formatMoney(spendingNet.toFixed(2)),
        },
      },
      {
        title: 'Financial Planner',
        accent: '#ec9bff',
        page: 'planner',
        metrics: {
          'Net Worth': formatMoney((investingValue - totalLoanDue).toFixed(2)),
          'Ledger Items': String(ledger.length),
          'AI Powered': 'Claude',
        },
      },
    ],
    [
      activeLoans,
      chartVisibleLoans,
      holdings.length,
      investingValue,
      ledger.length,
      spendingIncome,
      spendingNet,
      totalDailyChange,
      totalLoanDue,
      totalSpend,
    ],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOANS_STORAGE_KEY, JSON.stringify(loans))
  }, [loans])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SPENDING_STORAGE_KEY, JSON.stringify(spendingData))
  }, [spendingData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(INVESTING_STORAGE_KEY, JSON.stringify(investingData))
  }, [investingData])

  // Persist combined ledger
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger))
  }, [ledger])

  const body = useMemo(() => {
    if (currentPage === 'loans') {
      return <LoansPage loans={loans} setLoans={setLoans} onBack={() => setCurrentPage('dashboard')} />
    }
    if (currentPage === 'investing') {
      return (
        <InvestingPage
          onBack={() => setCurrentPage('dashboard')}
          investingData={investingData}
          setInvestingData={setInvestingData}
        />
      )
    }
    if (currentPage === 'spending') {
      return (
        <SpendingPage
          onBack={() => setCurrentPage('dashboard')}
          spendingData={spendingData}
          setSpendingData={setSpendingData}
        />
      )
    }
    if (currentPage === 'planner') {
      return (
        <FinancialPlannerPage
          onBack={() => setCurrentPage('dashboard')}
          loans={loans}
          spendingData={spendingData}
          investingData={investingData}
          ledger={ledger}
        />
      )
    }
    return (
      <DashboardPage
        totalEarnings={totalEarnings}
        estimatedSavings={estimatedSavings}
        breakdown={{
          cashFlow: spendingNet,
          loanPayments: monthlyLoanPayments,
          investGainsMonthly: totalDailyGainMonthly,
          investingTotal: investingValue,
          totalDebt: totalLoanDue,
        }}
        cards={cards}
        onNavigate={setCurrentPage}
      />
    )
  }, [cards, currentPage, estimatedSavings, investingData, investingValue, ledger, loans, monthlyLoanPayments, spendingData, spendingNet, totalDailyGainMonthly, totalEarnings, totalLoanDue])

  return (
    <div className="app-shell">
      <div className="prism-app-bg" aria-hidden="true">
        <Prism
          animationType="3drotate"
          timeScale={0.5}
          height={3.5}
          baseWidth={5.5}
          scale={3.6}
          hueShift={0}
          colorFrequency={1}
          noise={0}
          glow={1}
        />
      </div>
      {currentPage === 'planner' && (
        <div className="planner-gridscan-bg" aria-hidden="true">
          <GridScan
            sensitivity={0.55}
            lineThickness={1}
            linesColor="#25699d"
            gridScale={0.1}
            scanColor="#284af0"
            scanOpacity={0.4}
            enablePost
            bloomIntensity={0.6}
            chromaticAberration={0.002}
            noiseIntensity={0.01}
          />
        </div>
      )}
      {currentPage === 'spending' && (
        <div className="cashflow-floating-bg" aria-hidden="true">
          <FloatingLines
            linesGradient={['#16922f', '#159324', '#ffffff', '#a52222']}
            animationSpeed={1}
            interactive
            bendRadius={6}
            bendStrength={-0.5}
            mouseDamping={0.07}
            parallax
            parallaxStrength={0.3}
          />
        </div>
      )}
      <header className="app-bar glass-card">
        <GradientText
          colors={['#1b2a6b', '#69c6ff', '#2f6eff']}
          animationSpeed={2}
          showBorder={false}
          className="app-title-gradient"
        >
          <SplitText
            text="Your personal Finance Manager"
            className="app-title"
            delay={50}
            duration={1.25}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 40 }}
            to={{ opacity: 1, y: 0 }}
            threshold={0.1}
            rootMargin="-100px"
            textAlign="center"
            tag="h1"
            onLetterAnimationComplete={handleTitleAnimationComplete}
          />
        </GradientText>
      </header>
      <main className="content">{body}</main>
    </div>
  )
}

export default App
