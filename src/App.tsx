import { useEffect, useMemo, useState } from 'react'
import { Archive, Box, PackagePlus, Plus, Trash2, Pencil, Save, X, Scale, Euro } from 'lucide-react'
import { deleteShipment, getShipments, saveShipment, type Item, type Shipment } from './db'

const uid = () => crypto.randomUUID()
const integer = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)
const euros = (cents: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const weightKg = (grams: number) => `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(grams / 1000)} кг`
const weightGrams = (grams: number) => `${integer(grams)} г`

function MoneyValue({ cents }: { cents: number }) {
  return <span className="money-value"><span>{integer(cents)} ct</span><small className="sub-value">{euros(cents)}</small></span>
}

export default function App() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [shipmentName, setShipmentName] = useState('Новая посылка')
  const [packagingWeightGrams, setPackagingWeightGrams] = useState('0')
  const [items, setItems] = useState<Item[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', unitWeightGrams: '', quantity: '1', unitPriceCents: '' })
  const [loading, setLoading] = useState(true)

  const refresh = async () => setShipments(await getShipments())
  useEffect(() => { refresh().finally(() => setLoading(false)) }, [])

  const totals = useMemo(() => items.reduce((acc, item) => ({
    quantity: acc.quantity + item.quantity,
    weightGrams: acc.weightGrams + item.unitWeightGrams * item.quantity,
    priceCents: acc.priceCents + item.unitPriceCents * item.quantity,
  }), { quantity: 0, weightGrams: 0, priceCents: 0 }), [items])
  const packagingGrams = Math.max(0, Math.round(Number(packagingWeightGrams) || 0))
  const fullWeightGrams = totals.weightGrams + packagingGrams

  const resetForm = () => {
    setForm({ name: '', unitWeightGrams: '', quantity: '1', unitPriceCents: '' })
    setEditingId(null)
  }

  const addItem = () => {
    const weight = Number(form.unitWeightGrams)
    const quantity = Number(form.quantity)
    const price = Number(form.unitPriceCents)
    if (
      !form.name.trim() || form.unitWeightGrams.trim() === '' || form.quantity.trim() === '' || form.unitPriceCents.trim() === '' ||
      !Number.isInteger(weight) || !Number.isInteger(quantity) || !Number.isInteger(price) ||
      weight < 0 || quantity <= 0 || price < 0
    ) return

    const item: Item = {
      id: editingId || uid(),
      name: form.name.trim(),
      unitWeightGrams: weight,
      quantity,
      unitPriceCents: price,
    }
    setItems(current => editingId ? current.map(x => x.id === editingId ? item : x) : [...current, item])
    resetForm()
  }

  const editItem = (item: Item) => {
    setEditingId(item.id)
    setForm({
      name: item.name,
      unitWeightGrams: String(item.unitWeightGrams),
      quantity: String(item.quantity),
      unitPriceCents: String(item.unitPriceCents),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveCurrent = async () => {
    const shipment: Shipment = {
      id: activeId || uid(),
      name: shipmentName.trim() || 'Посылка без названия',
      createdAt: new Date().toISOString(),
      packagingWeightGrams: packagingGrams,
      items,
    }
    await saveShipment(shipment)
    setActiveId(shipment.id)
    await refresh()
  }

  const newShipment = () => {
    setActiveId('')
    setShipmentName('Новая посылка')
    setPackagingWeightGrams('0')
    setItems([])
    resetForm()
  }

  const openShipment = (s: Shipment) => {
    setActiveId(s.id)
    setShipmentName(s.name)
    setPackagingWeightGrams(String(s.packagingWeightGrams))
    setItems(s.items)
    resetForm()
  }

  const removeShipment = async (id: string) => {
    if (!confirm('Удалить эту посылку без возможности восстановления?')) return
    await deleteShipment(id)
    if (activeId === id) newShipment()
    await refresh()
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brand-icon"><PackagePlus size={22}/></div><div><div className="brand-title">Мои посылки</div><div className="brand-subtitle">Личный калькулятор отправлений</div></div></div>
      <button className="button button-light" onClick={newShipment}><Plus size={17}/> Новая посылка</button>
    </header>

    <section className="summary-grid">
      <div className="summary-card">
        <div className="summary-label"><Scale size={16}/> Общий вес с упаковкой</div>
        <div className="summary-value">{weightGrams(fullWeightGrams)} <small>{weightKg(fullWeightGrams)}</small></div>
        <div className="summary-note">Товары: {weightGrams(totals.weightGrams)} · Упаковка: {weightGrams(packagingGrams)}</div>
      </div>
      <div className="summary-card">
        <div className="summary-label"><Euro size={16}/> Стоимость товаров</div>
        <div className="summary-value">{euros(totals.priceCents)}</div>
        <div className="summary-note">{integer(totals.priceCents)} центов · {totals.quantity} шт. всего</div>
      </div>
    </section>

    <div className="layout">
      <section className="panel main-panel">
        <div className="section-heading"><div><div className="eyebrow">ТЕКУЩЕЕ ОТПРАВЛЕНИЕ</div><h1>Состав посылки</h1></div><span className="count-pill">{items.length} поз.</span></div>
        <div className="shipment-fields">
          <label className="field"><span>Название посылки</span><input value={shipmentName} onChange={e => setShipmentName(e.target.value)} placeholder="Например, Посылка ноябрь" /></label>
          <label className="field packaging"><span>Вес упаковки, г</span><input type="number" min="0" step="1" value={packagingWeightGrams} onChange={e => setPackagingWeightGrams(e.target.value)} placeholder="300" /></label>
        </div>

        <div className="form-card">
          <div className="form-title">{editingId ? 'Редактировать товар' : 'Добавить товар'}</div>
          <div className="item-form">
            <label className="field name-field"><span>Название товара</span><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Например, кофемашина" /></label>
            <label className="field"><span>Вес 1 шт., грамм</span><input type="number" min="0" step="1" value={form.unitWeightGrams} onChange={e => setForm({...form, unitWeightGrams: e.target.value})} placeholder="300" /></label>
            <label className="field"><span>Количество, шт.</span><input type="number" min="1" step="1" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} /></label>
            <label className="field"><span>Цена 1 шт., центов</span><input type="number" min="0" step="1" value={form.unitPriceCents} onChange={e => setForm({...form, unitPriceCents: e.target.value})} placeholder="99" /></label>
          </div>
          <div className="form-actions">{editingId && <button className="button button-ghost" onClick={resetForm}><X size={16}/> Отмена</button>}<button className="button button-primary" onClick={addItem}>{editingId ? <Save size={16}/> : <Plus size={17}/>} {editingId ? 'Сохранить изменения' : 'Добавить в посылку'}</button></div>
          <div className="input-hint">Вводи вес в граммах (например, 300), цену — в центах (например, 99).</div>
        </div>

        <div className="table-wrap">
          <table><thead><tr><th>Товар</th><th>Вес 1 шт., г</th><th>Кол-во</th><th>Общий вес, г</th><th>Цена 1 шт.</th><th>Сумма позиции</th><th></th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id}>
              <td className="product-name">{item.name}</td>
              <td>{weightGrams(item.unitWeightGrams)}</td>
              <td>{item.quantity}</td>
              <td className="strong">{weightGrams(item.unitWeightGrams * item.quantity)}</td>
              <td><MoneyValue cents={item.unitPriceCents}/></td>
              <td className="strong"><MoneyValue cents={item.unitPriceCents * item.quantity}/></td>
              <td><div className="row-actions"><button title="Редактировать" className="icon-button" onClick={() => editItem(item)}><Pencil size={15}/></button><button title="Удалить" className="icon-button danger" onClick={() => setItems(current => current.filter(x => x.id !== item.id))}><Trash2 size={15}/></button></div></td>
            </tr>)}</tbody>
          </table>
          {items.length === 0 && <div className="empty"><Box size={30}/><b>Пока нет товаров</b><span>Добавь первый товар с его весом в граммах и ценой в центах.</span></div>}
          {items.length > 0 && <div className="table-total"><b>ИТОГО</b><b>{totals.quantity} шт.</b><b>{weightGrams(totals.weightGrams)}</b><b><MoneyValue cents={totals.priceCents}/></b><span></span></div>}
        </div>
        <div className="bottom-actions"><div className="autosave-hint">Данные сохраняются на этом устройстве после нажатия «Сохранить посылку».</div><button className="button button-primary" onClick={saveCurrent}><Save size={17}/> Сохранить посылку</button></div>
      </section>

      <aside className="panel history-panel"><div className="history-heading"><div><div className="eyebrow">ЛОКАЛЬНАЯ БАЗА</div><h2><Archive size={19}/> Мои посылки</h2></div><span className="count-pill">{shipments.length}</span></div>
        {loading ? <p className="muted">Загрузка…</p> : shipments.length === 0 ? <div className="history-empty">Сохранённых посылок пока нет.</div> : <div className="history-list">{shipments.map(s => {
          const weight = s.items.reduce((sum, i) => sum + i.unitWeightGrams * i.quantity, 0)
          const price = s.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0)
          return <div className={`history-item ${activeId === s.id ? 'selected' : ''}`} key={s.id}><button className="history-open" onClick={() => openShipment(s)}><b>{s.name}</b><span>{new Date(s.createdAt).toLocaleDateString('ru-RU')}</span><small>{weightGrams(weight + s.packagingWeightGrams)} · {euros(price)}</small></button><button className="icon-button danger" title="Удалить посылку" onClick={() => removeShipment(s.id)}><Trash2 size={15}/></button></div>
        })}</div>}
        <div className="privacy-note">Данные хранятся только в браузере на этом устройстве. Сервер и платная подписка не нужны.</div>
      </aside>
    </div>
    <footer>Мои посылки · Бесплатно · Без регистрации</footer>
  </main>
}
