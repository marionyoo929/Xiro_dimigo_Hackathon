import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { storeQrToken } from '../lib/storeQr'

export default function StoreQrScanner({ onScan, onClose, connectionError = '' }: {
  onScan: (token: string) => Promise<boolean>; onClose: () => void; connectionError?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null), video = useRef<HTMLVideoElement>(null), photoInput = useRef<HTMLInputElement>(null)
  const stream = useRef<MediaStream | null>(null), active = useRef(true), connecting = useRef(false), reading = useRef(false), accepted = useRef(false)
  const callback = useRef(onScan); callback.current = onScan
  const [attempt, setAttempt] = useState(0), [error, setError] = useState(''), [status, setStatus] = useState('카메라를 준비하고 있어요…'), [busy, setBusy] = useState(false)
  const rejected = useRef({ value: '', until: 0 })
  function stopCamera() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; if (video.current) video.current.srcObject = null }
  async function recognize(value: string) {
    if (!active.current || connecting.current || accepted.current || rejected.current.value === value && Date.now() < rejected.current.until) return
    let token: string
    try { token = storeQrToken(value) } catch (reason) { setError((reason as Error).message); rejected.current = { value, until: Date.now() + 2500 }; return }
    connecting.current = true; setBusy(true); setError(''); setStatus('매장 QR을 확인하고 있어요…')
    try {
      const connected = await callback.current(token)
      if (!active.current) return
      if (connected) { accepted.current = true; stopCamera(); setStatus('매장 QR을 인식했어요.') }
      else { rejected.current = { value, until: Date.now() + 2500 }; setError('매장 연결을 확인해 주세요. 다른 QR을 비추거나 다시 시도할 수 있어요.'); setStatus('QR 코드를 사각형 안에 맞춰 주세요.') }
    } catch (reason) { if (active.current) { setError((reason as Error).message); rejected.current = { value, until: Date.now() + 2500 } } }
    finally { connecting.current = false; if (active.current) setBusy(false) }
  }
  const recognizeRef = useRef(recognize); recognizeRef.current = recognize
  useEffect(() => {
    active.current = true; dialog.current?.showModal()
    return () => { active.current = false; stopCamera(); dialog.current?.close() }
  }, [])
  useEffect(() => {
    let canceled = false, timer: ReturnType<typeof setTimeout> | undefined
    accepted.current = false; setError(''); setStatus('카메라 사용을 허용해 주세요.')
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError(window.isSecureContext ? '이 브라우저에서 카메라를 사용할 수 없어요. QR 사진을 선택해 주세요.' : '카메라는 HTTPS 또는 localhost에서 사용할 수 있어요. QR 사진 선택으로도 인식할 수 있어요.'); return }
      try {
        const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
        if (canceled) { camera.getTracks().forEach(track => track.stop()); return }
        stream.current = camera
        if (!video.current) { stopCamera(); return }
        video.current.srcObject = camera; await video.current.play()
        const { default: decode } = await import('jsqr')
        if (canceled) return
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('카메라 화면을 읽을 수 없어요.')
        setStatus('QR 코드를 사각형 안에 맞춰 주세요.')
        const scan = () => {
          if (canceled || accepted.current) return
          const frame = video.current
          if (frame && frame.readyState >= 2 && frame.videoWidth && !connecting.current && !reading.current) {
            const scale = Math.min(1, 800 / Math.max(frame.videoWidth, frame.videoHeight))
            canvas.width = Math.round(frame.videoWidth * scale); canvas.height = Math.round(frame.videoHeight * scale)
            context.drawImage(frame, 0, 0, canvas.width, canvas.height)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
            const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
            if (result?.data) void recognizeRef.current(result.data)
          }
          timer = setTimeout(scan, 180)
        }
        scan()
      } catch (reason) {
        if (canceled) return
        stopCamera()
        const name = (reason as Error).name
        setError(name === 'NotAllowedError' ? '카메라 권한이 꺼져 있어요. 브라우저에서 허용한 뒤 다시 켜거나 QR 사진을 선택해 주세요.'
          : name === 'NotFoundError' ? '사용할 카메라를 찾지 못했어요. QR 사진을 선택해 주세요.'
          : name === 'NotReadableError' ? '다른 앱에서 카메라를 사용 중이에요. 종료한 뒤 다시 켜 주세요.' : '카메라를 시작하지 못했어요. 다시 켜거나 QR 사진을 선택해 주세요.')
      }
    }
    void start()
    return () => { canceled = true; clearTimeout(timer); stopCamera() }
  }, [attempt])
  async function readPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || connecting.current || reading.current) return
    reading.current = true; setBusy(true); setError(''); setStatus('QR 사진을 읽고 있어요…')
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('사진을 읽지 못했어요. JPG 또는 PNG 사진을 선택해 주세요.')); image.src = url })
      const { default: decode } = await import('jsqr')
      if (!active.current) return
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('사진을 읽을 수 없어요.')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const result = decode(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
      if (!result?.data) throw new Error('사진에서 QR 코드를 찾지 못했어요. QR 전체가 선명하게 보이는 사진을 선택해 주세요.')
      await recognizeRef.current(result.data)
    } catch (reason) { if (active.current) setError((reason as Error).message) }
    finally { URL.revokeObjectURL(url); reading.current = false; if (active.current && !connecting.current) setBusy(false) }
  }
  return <dialog ref={dialog} className="store-qr-dialog" aria-labelledby="store-qr-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="qr-scanner-heading"><h2 id="store-qr-title">매장 QR 스캔</h2><button type="button" aria-label="스캔 닫기" onClick={onClose}>×</button></div>
    <p>매장에 비치된 시로 주문 QR을 카메라로 비춰 주세요.</p>
    <div className="qr-camera-view"><video ref={video} muted autoPlay playsInline aria-label="매장 QR 카메라 화면" /><span className="qr-camera-frame" aria-hidden="true" /></div>
    <p role="status">{busy ? '매장 QR을 확인하고 있어요…' : status}</p>
    {(connectionError || error) && <p className="error-box" role="alert">{connectionError || error}</p>}
    <div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => { rejected.current = { value: '', until: 0 }; setAttempt(value => value + 1) }}>카메라 다시 켜기</button><button type="button" className="secondary" disabled={busy} onClick={() => photoInput.current?.click()}>QR 사진 선택</button></div>
    <input ref={photoInput} type="file" accept="image/*" capture="environment" aria-label="QR 코드 사진" className="sr-only" disabled={busy} onChange={event => void readPhoto(event)} />
  </dialog>
}
