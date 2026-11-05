import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import { Empty } from './ui'
import { money } from '../lib/finance'
const palette = ['#8fc361', '#6d9f95', '#b4a6cf', '#d9b27a', '#869ec8', '#d38e83']
const tick = { fontSize: 11, fill: '#819087' }
const formatter = (v: unknown) => money(Number(v))
export function CompareChart({
  data,
}: {
  data: { month: string; income: number; expense: number }[]
}) {
  return !data.length ? (
    <Empty
      title="Grafiğiniz ilk kayıtla başlayacak."
      description="Seçili döneme ait gelir ve giderler burada karşılaştırılır."
    />
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={5}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={tick} />
          <YAxis
            tickFormatter={(v) => `${Number(v) / 100000}b`}
            axisLine={false}
            tickLine={false}
            tick={tick}
            width={44}
          />
          <Tooltip
            formatter={formatter}
            contentStyle={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          />
          <Bar dataKey="income" name="Gelir" fill="#91c66a" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar
            dataKey="expense"
            name="Gider"
            fill="#596c61"
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
export function ProfitChart({ data }: { data: { month: string; profit: number }[] }) {
  return !data.length ? (
    <Empty title="Kâr trendi için kayıt bekleniyor." />
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tick={tick} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            formatter={formatter}
            contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
          />
          <Line
            type="monotone"
            dataKey="profit"
            name="Net kâr"
            stroke="#91c66a"
            strokeWidth={3}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
export function DistributionChart({ data }: { data: { name: string; value: number }[] }) {
  return !data.length ? (
    <Empty
      title="Gider dağılımınız burada."
      description="Kategorilere göre harcamalarınızı inceleyin."
    />
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="53%"
            outerRadius="76%"
            paddingAngle={4}
            stroke="none"
          >
            {data.map((a, i) => (
              <Cell key={a.name} fill={palette[i % palette.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={formatter}
            contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
export function AppChart({ data }: { data: { name: string; value: number }[] }) {
  return !data.length ? (
    <Empty title="Uygulama geliri bulunmuyor." />
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={95}
            tick={tick}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={formatter} />
          <Bar dataKey="value" name="Gelir" fill="#91c66a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
export function FlowChart({
  data,
}: {
  data: { label: string; incoming: number; outgoing: number }[]
}) {
  return !data.length ? (
    <Empty title="Nakit hareketi henüz yok." />
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={formatter} />
          <Area
            type="monotone"
            dataKey="incoming"
            name="Nakit girişi"
            stroke="#91c66a"
            fill="#91c66a"
            fillOpacity={0.13}
          />
          <Area
            type="monotone"
            dataKey="outgoing"
            name="Nakit çıkışı"
            stroke="#d38e83"
            fill="#d38e83"
            fillOpacity={0.06}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
