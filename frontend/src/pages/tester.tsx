import { useRef, useState } from 'react'
import { Topbar } from '@/components/shell/topbar'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { CodeBlock } from '@/components/ui/code-block'
import { EmptyState } from '@/components/shared/empty-state'
import { runTestStream, useRunTest, type TestResponse, type TestStreamEvent } from '@/lib/hooks/use-tester'
import { useModels } from '@/lib/hooks/use-models'
import { useAccounts } from '@/lib/hooks/use-accounts'
import { useConfig } from '@/lib/hooks/use-config'
import { useToast } from '@/components/ui/toast'
import { Paperclip, X, Zap } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface PendingAttachment {
  filename: string
  mime_type: string
  file_data: string
}

export default function TesterPage() {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('auto')
  const [email, setEmail] = useState('')
  const [webSearch, setWebSearch] = useState(true)
  const [showThoughts, setShowThoughts] = useState(true)
  const [showRawJson, setShowRawJson] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [liveText, setLiveText] = useState('')
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveResponse, setLiveResponse] = useState<TestResponse | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const streamAbortRef = useRef<AbortController | null>(null)

  const runTest = useRunTest()
  const { data: modelsData } = useModels()
  const { data: accountsData } = useAccounts()
  const { data: configData } = useConfig()
  const { toast } = useToast()
  const { t } = useI18n()

  const sessionReady = configData?.session_ready !== false

  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    try {
      const next = await Promise.all(files.map(async (file) => ({
        filename: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_data: await readFileAsDataUrl(file),
      })))
      setAttachments((prev) => [...prev, ...next])
    } catch (error) {
      toast((error as Error).message || t('tester.readAttachmentFailed'), 'error')
    }
  }

  const handleStop = () => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    setIsStreaming(false)
  }

  const handleRun = async () => {
    if (!prompt.trim() && attachments.length === 0) return
    const payload = {
      prompt: prompt.trim(),
      model,
      web_search: webSearch,
      show_thoughts: showThoughts,
      email,
      dispatch_mode: email ? 'direct' : 'pool',
      attachments: attachments.map((attachment) => ({
        type: 'file' as const,
        filename: attachment.filename,
        mime_type: attachment.mime_type,
        file_data: attachment.file_data,
      })),
    }

    setHasStarted(true)
    setLiveText('')
    setLiveReasoning('')
    setLiveResponse(null)
    setStreamError(null)
    setShowRawJson(false)

    if (streamAbortRef.current) {
      streamAbortRef.current.abort()
    }
    const controller = new AbortController()
    streamAbortRef.current = controller
    setIsStreaming(true)

    try {
      const result = await runTestStream(payload, {
        signal: controller.signal,
        onEvent: (event: TestStreamEvent) => {
          if (event.event === 'admin_test.text.delta' && event.delta) {
            setLiveText((prev) => prev + event.delta)
            return
          }
          if (event.event === 'admin_test.reasoning.delta' && event.delta) {
            setLiveReasoning((prev) => prev + event.delta)
            return
          }
          if (event.event === 'admin_test.completed') {
            setLiveResponse({
              success: true,
              conversation_id: event.conversation_id,
              text: event.text,
              reasoning: event.reasoning,
              result: event.result,
            })
            return
          }
          if (event.event === 'admin_test.error') {
            setStreamError(event.detail || t('tester.failed'))
          }
        },
      })

      setLiveResponse(result)
      if (attachments.length > 0) {
        toast(t('tester.sentAttachments', { count: attachments.length }), 'success')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        const message = (error as Error).message || t('tester.failed')
        setStreamError(message)
        toast(message, 'error')
      }
    } finally {
      setIsStreaming(false)
      streamAbortRef.current = null
    }
  }

  const fallbackRun = () => {
    runTest.mutate(payloadFromState(prompt, model, webSearch, showThoughts, email, attachments), {
      onSuccess: () => {
        if (attachments.length > 0) {
          toast(t('tester.sentAttachments', { count: attachments.length }), 'success')
        }
      },
      onError: (error) => {
        toast((error as Error).message || t('tester.failed'), 'error')
      },
    })
  }

  const responseText = liveText || liveResponse?.text || runTest.data?.text || ''
  const responseReasoning = liveReasoning || liveResponse?.reasoning || runTest.data?.reasoning || ''
  const responseConversationID = liveResponse?.conversation_id || runTest.data?.conversation_id
  const responseRaw = liveResponse?.result || runTest.data?.result
  const busy = isStreaming || runTest.isPending

  return (
    <>
      <Topbar title={t('nav.tester')} />
      <div className="space-y-6 p-6">
        <PageHeader title={t('tester.pageTitle')} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Input Panel */}
        <Section title={t('tester.input')}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="tester-model" className="text-sm font-medium text-ink">{t('tester.model')}</label>
                <Select id="tester-model" value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="auto">auto</option>
                  {modelsData?.models?.filter(m => m.enabled).map(m => (
                    <option key={m.id} value={m.model_id}>{m.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tester-account" className="text-sm font-medium text-ink">{t('tester.account')}</label>
                <Select id="tester-account" value={email} onChange={(e) => setEmail(e.target.value)}>
                  <option value="">{t('tester.accountPool')}</option>
                  {accountsData?.accounts?.map((a: any) => (
                    <option key={a.email} value={a.email}>{a.email}</option>
                  ))}
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
              {t('tester.webSearch')}
            </label>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
              {t('tester.showThoughts')}
            </label>

            <Textarea
              aria-label={t('tester.promptPlaceholder')}
              placeholder={t('tester.promptPlaceholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[160px]"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink">{t('tester.attachments')}</label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-mute hover:text-ink">
                  <Paperclip className="h-4 w-4" />
                  <span>{t('tester.addFiles')}</span>
                  <input type="file" multiple className="hidden" onChange={handleAttachmentSelect} />
                </label>
              </div>
              {attachments.length > 0 ? (
                <div className="space-y-2 rounded-[var(--radius-card)] border border-hairline bg-canvas-soft p-3">
                  {attachments.map((attachment, index) => (
                    <div key={`${attachment.filename}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-ink">{attachment.filename}</p>
                        <p className="text-xs text-ink-mute">{attachment.mime_type}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                        className="text-ink-mute hover:text-ink"
                        aria-label={`Remove ${attachment.filename}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ink-mute">{t('tester.attachmentsHelp')}</p>
              )}
            </div>

            {!sessionReady && (
              <Alert variant="warning">{t('tester.noSession')}</Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleRun}
                loading={busy}
                disabled={(!prompt.trim() && attachments.length === 0) || !sessionReady || busy}
                className="w-full"
              >
                <Zap className="h-4 w-4" />
                {t('tester.run')}
              </Button>
              <Button
                onClick={handleStop}
                variant="secondary"
                disabled={!isStreaming}
                className="w-full"
              >
                {t('tester.stop')}
              </Button>
            </div>

            <Button onClick={fallbackRun} variant="ghost" size="sm" disabled={busy}>
              {t('tester.legacyJsonFallback')}
            </Button>
          </div>
        </Section>

        {/* Output Panel */}
        <Section title={t('tester.output')}>
          {!hasStarted && runTest.isIdle && !runTest.data && (
            <EmptyState
              icon={<Zap className="h-8 w-8" />}
              title={t('tester.noOutput')}
              description={t('tester.noOutputDesc')}
            />
          )}

          {streamError && (
            <Alert variant="error">{streamError}</Alert>
          )}

          {runTest.isError && !streamError && (
            <Alert variant="error">
              {(runTest.error as Error)?.message || t('tester.failed')}
            </Alert>
          )}

          {isStreaming && (
            <Alert>{t('tester.running')}</Alert>
          )}

          {(hasStarted || runTest.data) && (
            <div className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-sm text-ink">{responseText || t('tester.empty')}</p>
              </div>

              <Section title={t('tester.thinking')}>
                {showThoughts ? (
                  <p className="whitespace-pre-wrap text-sm text-ink-mute">{responseReasoning || t('tester.empty')}</p>
                ) : (
                  <p className="text-sm text-ink-mute">{t('tester.thinkingSuppressed')}</p>
                )}
              </Section>

              {responseConversationID && (
                <p className="text-xs text-ink-mute">{t('tester.conversation')}: {responseConversationID}</p>
              )}

              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-ink-mute-2 hover:text-ink-mute transition-colors"
              >
                {showRawJson ? t('tester.raw.hide') : t('tester.raw.show')}
              </button>

              {showRawJson && responseRaw && (
                <CodeBlock>{JSON.stringify(responseRaw, null, 2)}</CodeBlock>
              )}
            </div>
          )}
        </Section>
        </div>
      </div>
    </>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  })
}

function payloadFromState(
  prompt: string,
  model: string,
  webSearch: boolean,
  showThoughts: boolean,
  email: string,
  attachments: PendingAttachment[],
) {
  return {
    prompt: prompt.trim(),
    model,
    web_search: webSearch,
    show_thoughts: showThoughts,
    email,
    dispatch_mode: email ? 'direct' : 'pool',
    attachments: attachments.map((attachment) => ({
      type: 'file' as const,
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      file_data: attachment.file_data,
    })),
  }
}
