'use client';

import { Input } from '@/components/ui/Input';
import { RULES_MAX } from '@/lib/subscription/package-schema';
import { CLASS_TYPES, CLASS_TYPE_OPTION_LABELS, type ClassType } from '@/lib/utils/class-type';

/** Grupo de créditos tal como se edita en el formulario (strings de los inputs). */
export type RuleDraft = {
  credits: string;
  allowedClassTypes: ClassType[];
  limitTime: boolean;
  start: string;
  end: string;
  label: string;
};

export function emptyRule(): RuleDraft {
  return { credits: '1', allowedClassTypes: [], limitTime: false, start: '07:00', end: '11:00', label: '' };
}

export function ruleCredits(rules: readonly RuleDraft[]): number {
  return rules.reduce((sum, rule) => sum + (Number.parseInt(rule.credits, 10) || 0), 0);
}

interface PackageRulesBuilderProps {
  rules: RuleDraft[];
  onChange: (rules: RuleDraft[]) => void;
  /** `fieldErrors` del esquema (`rules.0.allowedClassTypes`, …). */
  errors: Record<string, string>;
}

/**
 * Grupos de créditos de un paquete especial (SPEC-SPECIAL-PACKAGES §7.3): créditos,
 * disciplinas permitidas (de `CLASS_TYPES`) y franja horaria opcional en hora CDMX.
 */
export function PackageRulesBuilder({ rules, onChange, errors }: PackageRulesBuilderProps) {
  function update(index: number, patch: Partial<RuleDraft>) {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  }

  function toggleType(index: number, type: ClassType) {
    const current = rules[index].allowedClassTypes;
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    update(index, { allowedClassTypes: CLASS_TYPES.filter((t) => next.includes(t)) });
  }

  const errorOf = (index: number, path: string) => errors[`rules.${index}.${path}`];

  return (
    <div className="space-y-4">
      {rules.map((rule, index) => {
        const derivedLabel = rule.allowedClassTypes.map((t) => CLASS_TYPE_OPTION_LABELS[t]).join(' / ');
        return (
          <fieldset key={index} className="rounded-lg border border-outline-variant p-4 space-y-4">
            <legend className="px-1 font-body text-body-md font-semibold text-on-surface">Grupo {index + 1}</legend>

            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <Input
                id={`rule-${index}-credits`}
                label="Créditos"
                type="number"
                min={1}
                max={100}
                value={rule.credits}
                onChange={(e) => update(index, { credits: e.target.value })}
                error={errorOf(index, 'credits')}
              />
              <Input
                id={`rule-${index}-label`}
                label="Etiqueta (opcional)"
                maxLength={60}
                placeholder={derivedLabel || 'Se arma con las disciplinas'}
                value={rule.label}
                onChange={(e) => update(index, { label: e.target.value })}
                error={errorOf(index, 'label')}
              />
            </div>

            <div>
              <p className="font-body text-body-md font-semibold text-on-surface mb-2">Disciplinas</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CLASS_TYPES.map((type) => (
                  <label key={type} className="inline-flex items-center gap-2 min-h-11 font-body text-body-md text-on-surface">
                    <input
                      type="checkbox"
                      checked={rule.allowedClassTypes.includes(type)}
                      onChange={() => toggleType(index, type)}
                      className="h-4 w-4 accent-primary"
                    />
                    {CLASS_TYPE_OPTION_LABELS[type]}
                  </label>
                ))}
              </div>
              {(errorOf(index, 'allowedClassTypes') || errorOf(index, 'allowedClassTypes.0')) && (
                <p role="alert" className="font-body text-[13px] text-error mt-1">
                  {errorOf(index, 'allowedClassTypes') ?? errorOf(index, 'allowedClassTypes.0')}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <label className="inline-flex items-center gap-2 min-h-11 font-body text-body-md text-on-surface">
                <input
                  type="checkbox"
                  checked={rule.limitTime}
                  onChange={(e) => update(index, { limitTime: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Limitar horario
              </label>
              {rule.limitTime && (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    id={`rule-${index}-start`}
                    label="Desde"
                    type="time"
                    value={rule.start}
                    onChange={(e) => update(index, { start: e.target.value })}
                    error={errorOf(index, 'timeWindow.start')}
                  />
                  <Input
                    id={`rule-${index}-end`}
                    label="Hasta"
                    type="time"
                    value={rule.end}
                    onChange={(e) => update(index, { end: e.target.value })}
                    error={errorOf(index, 'timeWindow.end')}
                  />
                  <p className="col-span-2 font-body text-[13px] text-on-surface-variant">
                    Hora de inicio de la clase en Ciudad de México; ambos extremos cuentan.
                  </p>
                </div>
              )}
            </div>

            {rules.length > 1 && (
              <button
                type="button"
                aria-label={`Quitar grupo ${index + 1}`}
                onClick={() => onChange(rules.filter((_, i) => i !== index))}
                className="min-h-11 font-body text-sm text-error underline underline-offset-2"
              >
                Quitar grupo
              </button>
            )}
          </fieldset>
        );
      })}

      {errors.rules && (
        <p role="alert" className="font-body text-[13px] text-error">
          {errors.rules}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={rules.length >= RULES_MAX}
          onClick={() => onChange([...rules, emptyRule()])}
          className="min-h-11 px-4 font-body text-sm border border-outline-variant rounded-DEFAULT hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Agregar grupo
        </button>
        <p className="font-body text-body-md text-on-surface">Sesiones del paquete: {ruleCredits(rules)}</p>
      </div>
    </div>
  );
}
