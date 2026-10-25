import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { StoreStats } from '../types/customerStats'

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
export default function MerchantStats({ restaurantId, preview, refreshKey }: { restaurantId: string; preview: boolean; refreshKey: unknown }) {
  const [days, setDays] = useState(7), [loaded, setResult] = useState<StoreStats | null>(null)
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null); setError('')
    if (restaurantId && !preview) void api<StoreStats>(`/merchant/restaurants/${encodeURIComponent(restaurantId)}/stats?days=${days}`, { expectJson: true }).then(value => { if (active) setResult(value) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [restaurantId, days, preview, refreshKey, attempt])
  if (preview) return <section className="summary-card"><h1>매장 통계</h1><p className="muted">매장을 등록하고 실제 주문을 접수하면 주문 추이와 인기 메뉴, 고객 통계를 확인할 수 있어요.</p></section>
  if (!restaurantId) return <p className="muted">통계를 확인할 매장을 먼저 등록해 주세요.</p>
  const result = loaded?.restaurantId === restaurantId && loaded.days === days ? loaded : null
  const summary = result?.summary, peak = Math.max(1, ...(result?.daily.map(day => day.orders) || []))
  return <section className="merchant-stats" aria-label="매장 통계"><h1>우리 가게 통계</h1>
    <div className="stats-period" role="group" aria-label="통계 기간">{([[3, '최근 3일'], [7, '일주일'], [30, '한 달']] as const).map(([value, label]) => <button key={value} className="secondary" aria-pressed={days === value} onClick={() => setDays(value)}>{label}</button>)}</div>
    <p className="muted">오늘 포함 · 한국 시간 · 주문 접수일 기준</p>
    {error ? <div className="stack"><p className="error-box" role="alert">{error}</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}>통계 다시 불러오기</button></div> : !result || !summary ? <p role="status">통계를 불러오는 중…</p> : <>
      <div className="stats-summary">
        <Stat label="접수한 주문" value={`${summary.orders}건`} />
        <Stat label="수락한 주문" value={`${summary.confirmedOrders}건`} />
        <Stat label="수락 주문 금액" value={won(summary.confirmedAmount)} />
        <Stat label="평균 주문 금액" value={won(summary.averageConfirmedAmount)} />
      </div>
      <p className="muted">접수 대기 {summary.pendingOrders}건 · 거절 {summary.rejectedOrders}건 · 제출 후 취소 {summary.canceledOrders}건</p>
      <section className="summary-card"><h2>일별 주문 추이</h2>
        {summary.orders === 0 && <p className="muted">선택한 기간에 접수한 주문이 없어요.</p>}
        <div className="stats-chart-scroll"><div className="stats-daily-chart" role="img" aria-label={`최근 ${days}일 접수 주문 ${summary.orders}건. 날짜별 수치는 아래 일별 내역에서 확인할 수 있어요.`} style={{ gridTemplateColumns: `repeat(${days}, minmax(25px, 1fr))` }}>{result.daily.map(day => <div key={day.date} title={`${day.date}: 접수 ${day.orders}건, 수락 ${day.confirmedOrders}건`}><small>{day.orders}</small><span style={{ height: `${Math.max(2, day.orders / peak * 80)}px` }} /><small>{day.date.slice(5).replace('-', '/')}</small></div>)}</div></div>
        <details><summary>일별 내역 보기</summary><div className="stats-table-scroll"><table className="stats-table"><thead><tr><th>날짜</th><th>접수</th><th>수락</th><th>수락 금액</th></tr></thead><tbody>{result.daily.map(day => <tr key={day.date}><th>{day.date}</th><td>{day.orders}건</td><td>{day.confirmedOrders}건</td><td>{won(day.confirmedAmount)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="summary-card"><h2>전체 가게 인기 카테고리</h2><p className="muted">우리 가게를 포함한 전체 가게 · 수락 주문 수량순 · 같은 음식 카테고리로 합산해요.</p>
        {result.market.popularCategories.length === 0 ? <p className="muted">선택한 기간에 수락한 주문이 없어요.</p> : <table className="stats-table" aria-label="전체 가게 카테고리 순위"><thead><tr><th>카테고리</th><th>주문 수량</th><th>주문 건수</th></tr></thead><tbody>{result.market.popularCategories.map((category, index) => <tr key={category.categoryId || 'uncategorized'}><th><span className="stats-rank">{index + 1}</span>{category.name}</th><td>{category.quantity}개</td><td>{category.orderCount}건</td></tr>)}</tbody></table>}
      </section>
      <section className="summary-card"><h2>우리 음식 대신 살아남은 카테고리</h2>
        {result.market.categoryInsights.ownCategories.length === 0 ? <p className="muted">매장 메뉴에 음식 카테고리를 등록하면 비교할 수 있어요.</p> : <>
          <p className="muted">우리 가게 카테고리: {result.market.categoryInsights.ownCategories.map(category => category.name).join(', ')}</p>
          <p className="muted">기간 내 음식 검토가 확정된 전체 모임 {result.market.categoryInsights.finalizedReviews}개 중 우리 카테고리가 하나 이상 소거된 모임 {result.market.categoryInsights.excludedReviews}개를 분석했어요.</p>
          {result.market.categoryInsights.excludedOwnCategories.length > 0 && <details><summary>우리 카테고리 소거 내역</summary><ul>{result.market.categoryInsights.excludedOwnCategories.map(category => <li key={category.categoryId}>{category.name} · {category.partyCount}개 모임</li>)}</ul></details>}
          {result.market.categoryInsights.survivingAlternatives.length === 0 ? <p className="muted">조건에 맞게 살아남은 다른 카테고리가 아직 없어요.</p> : <><ul className="stats-alternatives" aria-label="살아남은 다른 카테고리">{result.market.categoryInsights.survivingAlternatives.slice(0, 5).map(category => <li key={category.categoryId}><div><strong>{category.name}</strong><span>{category.partyCount}개 모임 · {category.sharePercent}%</span></div><span className="stats-track" aria-hidden="true"><span style={{ width: `${category.sharePercent}%` }} /></span></li>)}</ul><p className="muted">생존 모임 수 상위 5개 · 음식 검토 확정일 기준 · 모임당 각 카테고리를 한 번씩 세요. 여러 음식이 함께 살아남을 수 있어 비율 합계는 100%를 넘을 수 있어요.</p></>}
        </>}
      </section>
      <section className="summary-card"><h2>우리 가게 인기 메뉴</h2><p className="muted">수락한 주문의 메뉴 수량순 · 최대 10개 · 옵션 금액 포함</p>
        {result.popularMenus.length === 0 ? <p className="muted">아직 수락한 주문이 없어요.</p> : <table className="stats-table" aria-label="인기 메뉴 순위"><thead><tr><th>메뉴</th><th>수량</th><th>금액</th></tr></thead><tbody>{result.popularMenus.map((menu, index) => <tr key={menu.menuId}><th><span className="stats-rank">{index + 1}</span>{menu.name}</th><td>{menu.quantity}개</td><td>{won(menu.amount)}</td></tr>)}</tbody></table>}
      </section>
      <section className="summary-card"><h2>주문 고객 통계</h2><p className="muted">수락한 주문 참여 인원 {summary.participants}명 · 같은 고객의 재주문은 각각 합산해요. 주문 제출 당시 정보를 기준으로 하며 기존 정보 없는 주문은 미입력으로 표시해요.</p><h3>연령대</h3><Distribution rows={result.ageGroups} total={summary.participants} /><h3>성별</h3><Distribution rows={result.genders} total={summary.participants} /></section>
    </>}
  </section>
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="summary-card stats-metric"><span>{label}</span><strong>{value}</strong></div> }
function Distribution({ rows, total }: { rows: StoreStats['ageGroups']; total: number }) {
  return <ul className="stats-distribution">{rows.map(row => <li key={row.label}><span>{row.label}</span><span className="stats-track" aria-hidden="true"><span style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></span><strong>{row.count}명</strong></li>)}</ul>
}
