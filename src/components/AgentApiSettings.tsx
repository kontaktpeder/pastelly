import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/hooks/useLocale';

type TokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

type CreatedToken = TokenRow & { token: string };

function asTokenRows(data: unknown): TokenRow[] {
  const value = typeof data === 'string' ? JSON.parse(data) : data;
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is TokenRow => {
    return !!row && typeof row === 'object' && typeof (row as TokenRow).id === 'string';
  });
}

function asCreatedToken(data: unknown): CreatedToken | null {
  const value = typeof data === 'string' ? JSON.parse(data) : data;
  if (!value || typeof value !== 'object' || typeof (value as CreatedToken).token !== 'string') {
    return null;
  }
  return value as CreatedToken;
}

export default function AgentApiSettings({
  fieldStyle,
  primaryStyle,
  rule,
}: {
  fieldStyle: CSSProperties;
  primaryStyle: CSSProperties;
  rule: string;
}) {
  const { t, intlLocale } = useLocale();
  const queryClient = useQueryClient();
  const [name, setName] = useState('Grok');
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const tokens = useQuery({
    queryKey: ['agent-api-tokens'],
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('list_agent_api_tokens');
      if (rpcError) throw rpcError;
      return asTokenRows(data);
    },
  });

  const createToken = useMutation({
    mutationFn: async (tokenName: string) => {
      const { data, error: rpcError } = await supabase.rpc('create_agent_api_token', {
        p_name: tokenName,
      });
      if (rpcError) throw rpcError;
      const created = asCreatedToken(data);
      if (!created) throw new Error('empty');
      return created;
    },
    onSuccess: (created) => {
      setFreshToken(created.token);
      setCopied(false);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['agent-api-tokens'] });
    },
    onError: (err: Error) => {
      setError(err.message && err.message !== 'empty' ? err.message : t('profile.agentApiError'));
    },
  });

  const revokeToken = useMutation({
    mutationFn: async (id: string) => {
      const { error: rpcError } = await supabase.rpc('revoke_agent_api_token', { p_id: id });
      if (rpcError) throw rpcError;
    },
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['agent-api-tokens'] });
    },
    onError: (err: Error) => {
      setError(err.message || t('profile.agentApiError'));
    },
  });

  const copyToken = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const formatWhen = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  return (
    <section className="space-y-3 border-t pt-4" style={{ borderColor: rule }}>
      <p
        className="m-0 font-calendar text-[0.68rem] font-bold uppercase leading-none tracking-[0.2em]"
        style={{ color: primaryStyle.backgroundColor }}
      >
        {t('profile.agentApi')}
      </p>
      <p className="text-sm text-muted-foreground">{t('profile.agentApiHint')}</p>

      {freshToken && (
        <div className="space-y-2">
          <p className="text-sm text-foreground">{t('profile.agentApiOnce')}</p>
          <p className="break-all rounded-lg border px-3 py-2 font-mono text-sm" style={fieldStyle}>
            {freshToken}
          </p>
          <button
            type="button"
            onClick={copyToken}
            className="w-full rounded-lg border bg-transparent py-2.5 text-base font-medium"
            style={fieldStyle}
          >
            {copied ? t('profile.copied') : t('profile.agentApiCopy')}
          </button>
        </div>
      )}

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('profile.agentApiName')}
        maxLength={40}
        autoComplete="off"
        className="w-full rounded-lg border bg-transparent px-4 py-3 text-base focus:outline-none"
        style={fieldStyle}
      />
      <button
        type="button"
        onClick={() => {
          setError('');
          createToken.mutate(name.trim());
        }}
        disabled={createToken.isPending || name.trim().length === 0}
        className="w-full rounded-lg py-3 text-base font-semibold disabled:opacity-50"
        style={primaryStyle}
      >
        {createToken.isPending ? t('profile.agentApiCreating') : t('profile.agentApiCreate')}
      </button>

      {tokens.data && tokens.data.length === 0 && !tokens.isLoading && (
        <p className="text-sm text-muted-foreground">{t('profile.agentApiEmpty')}</p>
      )}

      {tokens.data && tokens.data.length > 0 && (
        <ul className="space-y-2">
          {tokens.data.map((token) => (
            <li
              key={token.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              style={fieldStyle}
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{token.name}</p>
                <p className="font-mono text-sm text-muted-foreground">{token.token_prefix}…</p>
                <p className="text-sm text-muted-foreground">
                  {token.last_used_at
                    ? t('profile.agentApiLastUsed', { when: formatWhen(token.last_used_at) })
                    : t('profile.agentApiNeverUsed')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeToken.mutate(token.id)}
                disabled={revokeToken.isPending}
                className="shrink-0 text-sm font-medium text-destructive underline underline-offset-2 disabled:opacity-50"
              >
                {t('profile.agentApiRevoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(error || tokens.error) && (
        <p className="text-center text-base text-destructive">
          {error || t('profile.agentApiError')}
        </p>
      )}
    </section>
  );
}
