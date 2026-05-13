import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert } from '@/components/ui/alert'
import { CodeBlock } from '@/components/ui/code-block'
import { EmptyState } from '@/components/shared/empty-state'
import { useRunTest } from '@/lib/hooks/use-tester'
import { useModels } from '@/lib/hooks/use-models'
import { useAccounts } from '@/lib/hooks/use-accounts'
import { useConfig } from '@/lib/hooks/use-config'
import { useToast } from '@/components/ui/toast'
import { Paperclip, X, Zap } from 'lucide-react'

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
  const [showRawJson, setShowRawJson] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])

  const runTest = useRunTest()
  const { data: modelsData } = useModels()
  const { data: accountsData } = useAccounts()
  const { data: configData } = useConfig()
  const { toast } = useToast()

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
      toast((error as Error).message || 'Failed to read attachment', 'error')
    }
  }

  const handleRun = () => {
    if (!prompt.trim() && attachments.length === 0) return
    runTest.mutate({
      prompt: prompt.trim(),
      model,
      web_search: webSearch,
      email,
      dispatch_mode: email ? 'direct' : 'pool',
      attachments: attachments.map((attachment) => ({
        type: 'file',
        filename: attachment.filename,
        mime_type: attachment.mime_type,
        file_data: attachment.file_data,
      })),
    }, {
      onSuccess: () => {
        if (attachments.length > 0) {
          toast(`Sent ${attachments.length} attachment(s)`, 'success')
        }
      },
      onError: (error) => {
        toast((error as Error).message || 'Test failed', 'error')
      },
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Prompt Tester" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <Section title="Input">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">Model</label>
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  <option value="auto">auto</option>
                  {modelsData?.models?.filter(m => m.enabled).map(m => (
                    <option key={m.id} value={m.model_id}>{m.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">Account</label>
                <Select value={email} onChange={(e) => setEmail(e.target.value)}>
                  <option value="">Pool (auto)</option>
                  {accountsData?.accounts?.map((a: any) => (
                    <option key={a.email} value={a.email}>{a.email}</option>
                  ))}
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} />
              Web Search
            </label>

            <Textarea
              placeholder="Enter your prompt..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[160px]"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink">Attachments</label>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-mute hover:text-ink">
                  <Paperclip className="h-4 w-4" />
                  <span>Add files</span>
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
                <p className="text-sm text-ink-mute">Optional. Files are sent inline to the admin tester request.</p>
              )}
            </div>

            {!sessionReady && (
              <Alert variant="warning">No active session available. Please set up an account first.</Alert>
            )}

            <Button
              onClick={handleRun}
              loading={runTest.isPending}
              disabled={(!prompt.trim() && attachments.length === 0) || !sessionReady || runTest.isPending}
              className="w-full"
            >
              <Zap className="h-4 w-4" />
              Run Test
            </Button>
          </div>
        </Section>

        {/* Output Panel */}
        <Section title="Output">
          {runTest.isIdle && !runTest.data && (
            <EmptyState
              icon={<Zap className="h-8 w-8" />}
              title="No output yet"
              description="Run a prompt to see the response here."
            />
          )}

          {runTest.isError && (
            <Alert variant="error">
              {(runTest.error as Error)?.message || 'Test failed. Please try again.'}
            </Alert>
          )}

          {runTest.data && (
            <div className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-sm text-ink">{runTest.data.text || '(empty response)'}</p>
              </div>

              {runTest.data.conversation_id && (
                <p className="text-xs text-ink-mute">Conversation: {runTest.data.conversation_id}</p>
              )}

              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-ink-mute-2 hover:text-ink-mute transition-colors"
              >
                {showRawJson ? 'Hide' : 'Show'} raw JSON
              </button>

              {showRawJson && runTest.data.result && (
                <CodeBlock>{JSON.stringify(runTest.data.result, null, 2)}</CodeBlock>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
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
