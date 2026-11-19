import '../server/loadEnv';
import { checkSupabaseReadiness } from '../server/db/supabaseReadiness';

const run = async () => {
  const report = await checkSupabaseReadiness(null, process.env.DEFAULT_TENANT_SLUG || 'renovo');

  console.log('\n=== Estúdio Renovo · Diagnóstico de Vínculo Supabase ===');
  console.log(`Projeto Ref: ${report.projectRef || '(não definido)'}`);
  console.log(`Configurado (.env): ${report.configured ? 'SIM' : 'NÃO'}`);
  console.log(`Conectado: ${report.connected ? 'SIM' : 'NÃO'} (${report.latencyMs} ms)`);
  console.log(`Direct DB URL: ${report.hasDirectDbUrl ? 'SIM' : 'NÃO'}`);
  console.log(`Tenant padrão (${report.expectedTenantSlug}): ${report.tenantRegistered ? 'Registrado' : 'Pendente bootstrap'}`);
  console.log(`Tabelas do schema: ${report.tablesReady}/${report.tablesChecked} disponíveis`);

  console.log('\nContagem por tabela:');
  for (const [table, count] of Object.entries(report.tableCounts)) {
    const label = count === null ? 'AUSENTE/ERRO' : `${count} registro(s)`;
    console.log(`  - ${table}: ${label}`);
  }

  if (report.missingTables.length > 0) {
    console.warn('\n[PENDÊNCIA] Tabelas ausentes:', report.missingTables.join(', '));
  }

  if (report.missingColumns.length > 0) {
    console.warn('\n[PENDÊNCIA] Colunas ausentes:');
    for (const col of report.missingColumns) {
      console.warn(`  - ${col.table}.${col.column}: ${col.reason}`);
    }
  }

  if (report.pendingMigrations.length > 0) {
    console.warn('\nMigrações sugeridas:', report.pendingMigrations.join(', '));
  }

  if (report.notes.length > 0) {
    console.log('\nObservações:');
    for (const note of report.notes) {
      console.log(`  * ${note}`);
    }
  }

  console.log(
    `\nStatus final de prontidão: ${report.readyForProduction ? '100% PRONTO' : 'CONECTADO COM AJUSTES PENDENTES NO SCHEMA'}\n`,
  );

  if (!report.configured || !report.connected) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('Erro ao verificar vínculo com Supabase:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
