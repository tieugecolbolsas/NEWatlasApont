import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

// Determine if we should use direct Supabase client instead of Express proxy
// 1. If we are on Vercel (vercel.app)
// 2. If we are on any other static deployment where proxy doesn't run, and we have VITE config
const useDirectClient = 
  window.location.hostname.includes('vercel.app') || 
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('github.io') ||
  !!(supabaseUrl && supabaseAnonKey);

let activeClient: any;

if (useDirectClient) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Atlas Supabase] ERRO: Você está rodando em uma hospedagem estática (Vercel), mas as variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não estão configuradas no painel da hospedagem!');
  }
  console.log('[Atlas Supabase] Utilizando conexão direta com o Supabase (Modo Deploy Estático/Vercel)');
  activeClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.log('[Atlas Supabase] Utilizando conexão via Proxy Express (Modo AI Studio/Cloud Run)');
  
  // Helper to make native Promise objects with custom properties (chainable)
  const makeQueryPromise = (executor: (resolve: any) => void, chainMethods: Record<string, Function> = {}): any => {
    const promise = new Promise(executor) as any;
    for (const [key, fn] of Object.entries(chainMethods)) {
      promise[key] = fn;
    }
    return promise;
  };

  activeClient = {
    auth: {
      signInWithPassword: async ({ email, password }: any) => {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const result = await response.json();
          if (!response.ok) {
            return { data: { user: null }, error: { message: result.error || 'E-mail ou senha incorretos.' } };
          }
          return { data: { user: result.user }, error: null };
        } catch (err: any) {
          return { data: { user: null }, error: { message: err.message || 'Erro ao conectar ao servidor seguro.' } };
        }
      }
    },
    channel: (name: string) => {
      const mockChannel = {
        on: (event: string, filter: any, callback: any) => {
          return mockChannel;
        },
        subscribe: () => {
          return mockChannel;
        }
      };
      return mockChannel;
    },
    removeChannel: (channel: any) => {
      // No-op for realtime compatibility
    },
    from: (tableName: string) => {
      return activeClient.schema('public').from(tableName);
    },
    schema: (schemaName: string) => {
      return {
        from: (tableName: string) => {
          return {
            select: (fields: string = '*') => {
              const eqFilters: Array<{ field: string, val: any }> = [];
              let isGte = false;
              let gteField = '';
              let gteVal = '';
              let isLimit = false;
              let limitVal = 0;
              let isOrder = false;
              let orderField = '';
              let ascending = false;

              const executeQuery = async () => {
                try {
                  // If it's a date-range query with gte, use the specialized /api/historico route
                  if (isGte) {
                    const response = await fetch(`/api/historico?schema=${schemaName}&table=${tableName}&gte_field=${gteField}&gte_val=${encodeURIComponent(gteVal)}&order_field=${orderField || 'data_registro'}&asc=${ascending}`);
                    const data = await response.json();
                    if (!response.ok) {
                      return { data: null, error: { message: data.error || 'Erro ao carregar histórico' } };
                    }
                    return { data, error: null };
                  }

                  // Standard select query via our new generic select proxy
                  const response = await fetch('/api/supabase/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      schema: schemaName,
                      table: tableName,
                      selectFields: fields,
                      filters: eqFilters.map(f => ({ field: f.field, op: 'eq', val: f.val }))
                    })
                  });
                  const data = await response.json();
                  if (!response.ok) {
                    return { data: null, error: { message: data.error || 'Erro ao carregar dados' } };
                  }
                  return { data, error: null };
                } catch (err: any) {
                  return { data: null, error: err };
                }
              };

              // Return a chainable object that behaves like a Promise
              const queryChain: any = {
                then: (onfulfilled: any, onrejected?: any) => {
                  return executeQuery().then(onfulfilled, onrejected);
                },
                eq: (field: string, val: any) => {
                  eqFilters.push({ field, val });
                  return queryChain;
                },
                limit: (val: number) => {
                  isLimit = true;
                  limitVal = val;
                  return queryChain;
                },
                gte: (field: string, val: any) => {
                  isGte = true;
                  gteField = field;
                  gteVal = val;
                  return queryChain;
                },
                order: (field: string, options: any = {}) => {
                  isOrder = true;
                  orderField = field;
                  ascending = options.ascending !== false;
                  return queryChain;
                }
              };

              return queryChain;
            },
            delete: () => {
              return {
                eq: (eqField: string, eqVal: any) => {
                  return {
                    then: async (resolve: any, reject?: any) => {
                      try {
                        const response = await fetch('/api/supabase/delete', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            schema: schemaName,
                            table: tableName,
                            eqField,
                            eqVal
                          })
                        });
                        const result = await response.json();
                        if (!response.ok) {
                          resolve({ data: null, error: { message: result.error || 'Erro ao deletar dados' } });
                        } else {
                          resolve({ data: result.data, error: null });
                        }
                      } catch (err: any) {
                        if (reject) reject(err);
                        else resolve({ data: null, error: err });
                      }
                    }
                  };
                }
              };
            },
            update: (updateObj: any) => {
              return {
                eq: (idField: string, idVal: any) => {
                  return makeQueryPromise(async (resolve) => {
                    try {
                      const response = await fetch('/api/supabase/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          schema: schemaName,
                          table: tableName,
                          updateObj,
                          eqField: idField,
                          eqVal: idVal
                        })
                      });
                      const result = await response.json();
                      if (!response.ok) {
                        resolve({ data: null, error: { message: result.error || 'Erro ao atualizar dados' } });
                      } else {
                        resolve({ data: result.data, error: null });
                      }
                    } catch (err: any) {
                      resolve({ data: null, error: err });
                    }
                  });
                }
              };
            },
            insert: (insertArr: any[]) => {
              return makeQueryPromise(async (resolve) => {
                try {
                  const response = await fetch('/api/supabase/insert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      schema: schemaName,
                      table: tableName,
                      insertArr
                    })
                  });
                  const result = await response.json();
                  if (!response.ok) {
                    resolve({ data: null, error: { message: result.error || 'Erro ao inserir registro' } });
                  } else {
                    resolve({ data: result.data, error: null });
                  }
                } catch (err: any) {
                  resolve({ data: null, error: err });
                }
              });
            }
          };
        }
      };
    }
  };
}

export const supabase = activeClient;
