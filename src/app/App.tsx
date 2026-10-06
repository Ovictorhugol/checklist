import { useEffect, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Archive,
  KeyRound,
  LogOut,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react'
import EquipmentModel from '../components/EquipmentModel'
import InspectionPanel from '../components/InspectionPanel'
import DeliveriesPage from '../pages/DeliveriesPage'
import DeletedDeliveriesPage from '../pages/DeletedDeliveriesPage'
import LoginScreen from '../pages/LoginScreen'
import { equipmentCatalog, getInitialParts, type EquipmentId, type EquipmentPart, type InspectionStatus } from '../domain/inspection'
import { useDeliveries } from '../hooks/useDeliveries'
import { getLocalSession, getUserName, getUserRole, logoutLocalSession, type AuthUser } from '../services/auth'
import { apiChangePassword } from '../services/api'
import { microsoftAuthEnabled, logoutMicrosoft } from '../services/microsoftAuth'
import '../styles/App.css'
import { formatCpf, isValidCpf, normalizeCpf } from '../domain/cpf'

const appStartDate = new Date()

function App() {
  const [equipmentId, setEquipmentId] = useState<EquipmentId>('notebook')
  const [equipmentModel, setEquipmentModel] = useState('')
  const [equipmentBrand, setEquipmentBrand] = useState('')
  const [accessories, setAccessories] = useState('')
  const [parts, setParts] = useState(() => getInitialParts('notebook'))
  const [selectedPartId, setSelectedPartId] = useState('display')
  const [assetTag, setAssetTag] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [recipient, setRecipient] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientCpf, setRecipientCpf] = useState('')
  const [recipientCpfTouched, setRecipientCpfTouched] = useState(false)
  const [recipientDepartment, setRecipientDepartment] = useState('')
  const [registered, setRegistered] = useState(false)
  const [registrationBusy, setRegistrationBusy] = useState(false)
  const [registrationError, setRegistrationError] = useState('')
  const [registeredProtocol, setRegisteredProtocol] = useState('')
  const [activePage, setActivePage] = useState<'checklist' | 'deliveries' | 'deleted'>('deliveries')
  const [deliveriesResetKey, setDeliveriesResetKey] = useState(0)
  const [userEmail, setUserEmail] = useState<string | null>(getLocalSession)
  const [userName, setUserName] = useState<string | null>(getUserName)
  const [userRole, setUserRole] = useState<'admin' | 'operator'>(getUserRole)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const { deliveries, loadError, loading, addDelivery, saveReturnInspection, deleteDelivery, refresh } = useDeliveries(userEmail, userRole === 'operator')

  useEffect(() => {
    const expireSession = () => { logoutLocalSession(); setUserEmail(null); setUserName(null); setUserRole('operator') }
    window.addEventListener('donato-session-expired', expireSession)
    return () => window.removeEventListener('donato-session-expired', expireSession)
  }, [])
  const selectedEquipment = equipmentCatalog.find((equipment) => equipment.id === equipmentId) ?? equipmentCatalog[0]
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? parts[0]
  const inspectedCount = parts.filter((part) => part.status !== 'pending').length
  const damagedCount = parts.filter((part) => part.status === 'damaged').length
  const isComplete = inspectedCount === parts.length
  const isRecipientEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())
  const isRecipientCpfValid = isValidCpf(recipientCpf)
  const showCpfError = !isRecipientCpfValid && (recipientCpfTouched || normalizeCpf(recipientCpf).length === 11)
  const deliveryBlockers = [
    ...(!assetTag.trim() ? ['Patrimônio'] : []),
    ...(!serialNumber.trim() ? ['Número de série'] : []),
    ...(!recipient.trim() ? ['Responsável pelo recebimento'] : []),
    ...(!recipientCpf.trim() ? ['CPF do responsável'] : !isRecipientCpfValid ? ['Informe um CPF válido'] : []),
    ...(!recipientEmail.trim() ? ['E-mail do responsável'] : !isRecipientEmailValid ? ['Informe um e-mail válido (ex.: exemplo@donatoholhos.com)'] : []),
    ...(!recipientDepartment.trim() ? ['Setor do responsável'] : []),
    ...(!equipmentModel.trim() ? ['Modelo do equipamento'] : []),
    ...(!equipmentBrand.trim() ? ['Marca'] : []),
    ...(!isComplete ? [`Inspecione ${parts.length - inspectedCount} ${parts.length - inspectedCount === 1 ? 'item pendente' : 'itens pendentes'}`] : []),
  ]

  const updatePart = (partId: string, update: Partial<EquipmentPart>) => {
    setRegistered(false)
    setParts((current) => current.map((part) => part.id === partId ? { ...part, ...update } : part))
  }

  const inspectPart = (status: Exclude<InspectionStatus, 'pending'>) => {
    const currentIndex = parts.findIndex((part) => part.id === selectedPart.id)
    const nextPendingPart = [
      ...parts.slice(currentIndex + 1),
      ...parts.slice(0, currentIndex),
    ].find((part) => part.status === 'pending')

    updatePart(selectedPart.id, { status })
    if (status === 'ok' && nextPendingPart) setSelectedPartId(nextPendingPart.id)
  }

  const resetChecklist = () => {
    setParts(getInitialParts(equipmentId))
    setRegistered(false)
    setSelectedPartId(getInitialParts(equipmentId)[0].id)
  }

  const changeEquipment = (nextEquipmentId: EquipmentId) => {
    setEquipmentId(nextEquipmentId)
    setEquipmentModel('')
    setEquipmentBrand('')
    const nextParts = getInitialParts(nextEquipmentId)
    setParts(nextParts)
    setSelectedPartId(nextParts[0].id)
    setRegistered(false)
  }

  const registerDelivery = async () => {
    if (deliveryBlockers.length || registrationBusy) return
    setRegistrationBusy(true)
    setRegistrationError('')
    try {
      const saved = await addDelivery({
        assetTag: assetTag.trim(),
        serialNumber: serialNumber.trim(),
        recipient: recipient.trim(),
        recipientEmail: recipientEmail.trim().toLowerCase(),
        recipientCpf: normalizeCpf(recipientCpf),
        recipientDepartment: recipientDepartment.trim(),
        equipment: selectedEquipment.apiName,
        model: equipmentModel.trim(),
        brand: equipmentBrand.trim(),
        accessories: accessories.trim(),
        parts: parts.map(({ id, label, status, note }) => ({
          id,
          label,
          status: status === 'damaged' ? 'damaged' : 'ok',
          note: note.trim(),
        })),
      })
      setRegisteredProtocol(saved.protocol)
      setRegistered(true)
    } catch (error) {
      setRegistrationError((error as Error).message)
    } finally {
      setRegistrationBusy(false)
    }
  }

  const handleLogin = (user: AuthUser) => {
    setUserEmail(user.email)
    setUserName(user.name?.trim() || null)
    setUserRole(user.role)
    setActivePage('deliveries')
    setDeliveriesResetKey((prev) => prev + 1)
  }

  const logout = () => {
    if (microsoftAuthEnabled) void logoutMicrosoft().catch(() => {
      window.alert('Você saiu do checklist. Não foi possível encerrar a sessão na Microsoft.')
    })
    logoutLocalSession()
    setUserEmail(null)
    setUserName(null)
    setUserRole('operator')
    setActivePage('deliveries')
    setDeliveriesResetKey((prev) => prev + 1)
  }

  const closePasswordDialog = () => {
    if (passwordBusy) return
    setIsPasswordDialogOpen(false)
    setNewPassword('')
    setPasswordError('')
    setPasswordSuccess('')
  }

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordBusy(true)
    setPasswordError('')
    setPasswordSuccess('')

    try {
      await apiChangePassword(newPassword)
      setNewPassword('')
      setPasswordSuccess('Senha atualizada com sucesso.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar a senha.'
      setPasswordError(message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : message)
    } finally {
      setPasswordBusy(false)
    }
  }

  if (!userEmail) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Menu principal">
        <a
          className="brand"
          href="#entregas"
          aria-label="Donato Hospital de Olhos, início"
          onClick={() => {
            setActivePage('deliveries')
            setDeliveriesResetKey((prev) => prev + 1)
          }}
        >
          <img className="brand-mark" src="/donato-eye.svg" alt="" />
          <span className="brand-wordmark"><strong>DONATO</strong><small>HOSPITAL DE OLHOS</small></span>
        </a>
        <nav className="side-nav-pages" aria-label="Páginas">
          <span className="side-nav-label">PÁGINAS</span>
          <button
            type="button"
            className={`side-nav-link ${activePage === 'deliveries' ? 'side-nav-link-active' : ''}`}
            aria-current={activePage === 'deliveries' ? 'page' : undefined}
            onClick={() => {
              setActivePage('deliveries')
              setDeliveriesResetKey((prev) => prev + 1)
            }}
          >
            <ClipboardList size={17} /><span>{userRole === 'admin' ? 'Entregas' : 'Minhas entregas'}</span>
          </button>
          {!microsoftAuthEnabled && <button
            type="button"
            className="side-nav-link side-nav-security"
            aria-label="Alterar senha"
            title="Alterar senha"
            onClick={() => {
              setPasswordError('')
              setPasswordSuccess('')
              setNewPassword('')
              setIsPasswordDialogOpen(true)
            }}
          >
            <KeyRound size={17} /><span>Alterar senha</span>
          </button>}
          {userRole === 'admin' && (
            <button
              type="button"
              className={`side-nav-link ${activePage === 'deleted' ? 'side-nav-link-active' : ''}`}
              aria-current={activePage === 'deleted' ? 'page' : undefined}
              onClick={() => setActivePage('deleted')}
            >
              <Archive size={17} /><span>Excluídas</span>
            </button>
          )}
        </nav>
        <button className="side-nav-logout" type="button" onClick={logout}>
          <span className="avatar">{userEmail.slice(0, 1).toUpperCase()}</span><span className="side-nav-user-email">{userEmail}</span><LogOut size={15} />
        </button>
      </aside>

      <div className="page-area">
        <DeliveriesPage
          key={deliveriesResetKey}
          deliveries={deliveries}
          onNewDelivery={() => setActivePage('checklist')}
          onSaveReturn={saveReturnInspection}
          onDeleteDelivery={deleteDelivery}
          isAdmin={userRole === 'admin'}
          personalEmail={userRole === 'operator' ? userEmail : undefined}
          personalName={userRole === 'operator' ? userName : undefined}
          hidden={activePage !== 'deliveries'}
        />
        {userRole === 'admin' && <DeletedDeliveriesPage hidden={activePage !== 'deleted'} />}
        {loading && <p role="status">Carregando entregas...</p>}
        {loadError && <div role="alert"><p>{loadError}</p><button type="button" onClick={() => void refresh()}>Tentar carregar novamente</button></div>}
        <main id="inicio" className="workspace" hidden={activePage !== 'checklist' || userRole !== 'admin'}>
        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> RECEBIMENTO DE ATIVO</div>
            <h1>Conferência de equipamento</h1>
            <p>{selectedEquipment.name}</p>
          </div>
          <div className="heading-meta">
            <span className="meta-label">PROTOCOLO</span>
            <strong>Atribuído ao registrar</strong>
          </div>
        </section>

        <fieldset disabled={registrationBusy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, pointerEvents: registrationBusy ? 'none' : undefined }}>
        <section className="inspection-layout" aria-label="Conferência do equipamento">
          <EquipmentModel equipmentId={equipmentId} parts={parts} selectedPartId={selectedPartId} onSelectPart={setSelectedPartId} />
          <InspectionPanel
            parts={parts}
            selectedPart={selectedPart}
            selectedPartId={selectedPartId}
            inspectedCount={inspectedCount}
            onSelectPart={setSelectedPartId}
            onInspectPart={inspectPart}
            onUpdateNote={(note) => updatePart(selectedPart.id, { note })}
          />
        </section>

        <section className="delivery-section" aria-labelledby="delivery-title">
          <div className="delivery-heading">
            <div className="delivery-title-wrap">
              <span className="delivery-icon"><ClipboardCheck size={17} /></span>
              <div><div className="section-kicker">DADOS DA MOVIMENTAÇÃO</div><h2 id="delivery-title">Detalhes da entrega</h2></div>
            </div>
            <button className="reset-button" type="button" onClick={resetChecklist}><RotateCcw size={14} /> Limpar conferência</button>
          </div>
          <div className="delivery-fields">
            <label className="data-field equipment-field"><span>Equipamento</span><select value={equipmentId} onChange={(event) => changeEquipment(event.target.value as EquipmentId)}>
              {equipmentCatalog.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.id === 'desktop' ? 'Desktop' : equipment.id === 'phone' ? 'Celular' : equipment.id === 'monitor' ? 'Monitor' : 'Notebook'}</option>)}
            </select></label>
            <label className="data-field"><span>Modelo do equipamento</span><input required value={equipmentModel} onChange={(event) => { setEquipmentModel(event.target.value); setRegistered(false) }} /></label>
            <label className="data-field"><span>Marca</span><input required value={equipmentBrand} onChange={(event) => { setEquipmentBrand(event.target.value); setRegistered(false) }} /></label>
            <label className="data-field"><span>Patrimônio</span><input required value={assetTag} onChange={(event) => { setAssetTag(event.target.value); setRegistered(false) }} /></label>
            <label className="data-field"><span>Número de série</span><input required value={serialNumber} onChange={(event) => { setSerialNumber(event.target.value); setRegistered(false) }} /></label>
            <label className="data-field recipient-field"><span>Responsável pelo recebimento</span><input required value={recipient} onChange={(event) => { setRecipient(event.target.value); setRegistered(false) }} /></label>
            <label className="data-field"><span>E-mail do responsável</span><input type="email" autoComplete="email" required value={recipientEmail} onChange={(event) => { setRecipientEmail(event.target.value); setRegistered(false) }} placeholder="exemplo@donatoholhos.com" /></label>
            <label className="data-field">
              <span>CPF do responsável</span>
              <input required inputMode="numeric" maxLength={14} value={recipientCpf}
                onChange={(event) => { setRecipientCpf(formatCpf(event.target.value)); setRegistered(false) }}
                onBlur={() => setRecipientCpfTouched(true)}
                placeholder="000.000.000-00" aria-invalid={showCpfError}
                aria-describedby={showCpfError ? 'recipient-cpf-error' : undefined} />
              {showCpfError && <small id="recipient-cpf-error" className="data-field-error" role="status">
                {recipientCpf ? 'CPF inválido. Confira os 11 números informados.' : 'Informe o CPF do responsável.'}
              </small>}
            </label>
            <label className="data-field"><span>Setor do responsável</span><input required value={recipientDepartment} onChange={(event) => { setRecipientDepartment(event.target.value); setRegistered(false) }} placeholder="Ex.: Tecnologia da Informação" /></label>
            <div className="data-field date-field"><span>Data da entrega</span><div className="date-value">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(appStartDate)}</div></div>
            <label className="data-field accessories-field"><span>Acessórios entregues</span><textarea value={accessories} onChange={(event) => { setAccessories(event.target.value); setRegistered(false) }} placeholder="Ex.: carregador, cabo HDMI, bolsa" rows={2} /></label>
          </div>
          <div className="delivery-footer">
            <div className={`delivery-summary ${damagedCount ? 'summary-warning' : ''}`}>
              {damagedCount ? <CircleAlert size={16} /> : <ShieldCheck size={16} />}
              <span>{damagedCount ? `${damagedCount} ${damagedCount === 1 ? 'dano registrado' : 'danos registrados'}` : 'Nenhum dano registrado'}</span>
              <span className="summary-separator">·</span>
              <span>{inspectedCount} de {parts.length} itens conferidos</span>
            </div>
            {registered ? (
              <div className="registered-state"><CheckCircle2 size={17} /> Entrega registrada</div>
            ) : (
              <button className="submit-button" type="button" disabled={deliveryBlockers.length > 0 || registrationBusy || loading} onClick={() => void registerDelivery()}>
                <Save size={16} /> {registrationBusy ? 'Registrando...' : 'Registrar entrega'}
              </button>
            )}
          </div>
          {registrationError && <p role="alert">{registrationError}</p>}
          {!registered && deliveryBlockers.length > 0 && (
            <p className="delivery-validation-message" role="status">
              Para registrar: {deliveryBlockers.join(' · ')}.
            </p>
          )}
          {registered && (
            <div className="confirmation-banner" role="status"><CheckCircle2 size={16} /> Protocolo {registeredProtocol} registrado para {recipient}.</div>
          )}
          {!isComplete && <p className="completion-hint">Inspecione {parts.length - inspectedCount} {parts.length - inspectedCount === 1 ? 'item restante' : 'itens restantes'} para registrar a entrega.</p>}
          {registered && <button className="history-link-button" type="button" onClick={() => setActivePage('deliveries')}>Ver entregas realizadas</button>}
        </section>

        </fieldset>
        <footer className="page-footer"><span>DONATO HOSPITAL DE OLHOS <span className="footer-dot">·</span> CONTROLE DE EQUIPAMENTOS</span></footer>
        </main>
      </div>
      {isPasswordDialogOpen && (
        <div
          className="password-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePasswordDialog()
          }}
        >
          <section className="password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
            <header className="password-dialog-heading">
              <div>
                <span className="section-kicker">CONTA</span>
                <h2 id="password-dialog-title">Alterar senha</h2>
              </div>
              <button className="password-dialog-close" type="button" onClick={closePasswordDialog} disabled={passwordBusy} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            {passwordSuccess ? (
              <div className="password-dialog-result">
                <p className="password-success" role="status"><CheckCircle2 size={16} />{passwordSuccess}</p>
                <button className="password-save-button" type="button" onClick={closePasswordDialog}>Concluir</button>
              </div>
            ) : (
              <form className="password-dialog-form" onSubmit={submitPasswordChange}>
                <label className="password-dialog-field">
                  <span>Nova senha</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    autoFocus
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>
                {passwordError && <p className="password-error" role="alert">{passwordError}</p>}
                <div className="password-dialog-actions">
                  <button className="password-cancel-button" type="button" onClick={closePasswordDialog} disabled={passwordBusy}>Cancelar</button>
                  <button className="password-save-button" type="submit" disabled={passwordBusy || newPassword.length < 8}>
                    {passwordBusy ? 'Salvando...' : 'Salvar senha'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
