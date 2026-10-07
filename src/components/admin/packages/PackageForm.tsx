'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { PackageCard } from '@/components/sections/PackageCard';
import { createPackageAction, updatePackageAction } from '@/actions/admin-packages';
import type { AdminPackageView } from '@/lib/queries/packages';
import {
  DEFAULT_VALIDITY_DAYS,
  DESCRIPTION_MAX,
  FEATURE_MAX_LENGTH,
  FEATURES_MAX,
  NAME_MAX,
  packageInputSchema,
  toFieldErrors,
  type PackageInput,
} from '@/lib/subscription/package-schema';
import { toPackageCardView } from '@/lib/subscription/package-view';
import type { PackageKind } from '@/db/schema';
import { PackageRulesBuilder, emptyRule, ruleCredits, type RuleDraft } from './PackageRulesBuilder';

type ValidityUnit = 'days' | 'weeks';

type FormState = {
  kind: PackageKind;
  name: string;
  shortDescription: string;
  features: string[];
  price: string;
  validityAmount: string;
  validityUnit: ValidityUnit;
  sessions: string;
  guestCredits: string;
  displayOrder: string;
  isFeatured: boolean;
  rules: RuleDraft[];
};

const DESCRIPTION_TOO_LONG = 'La descripción debe tener menos de 50 caracteres.';

function initialState(pkg?: AdminPackageView): FormState {
  const days = pkg?.validityDays ?? DEFAULT_VALIDITY_DAYS;
  const inWeeks = days % 7 === 0 && days !== 28;
  return {
    kind: pkg?.kind ?? 'standard',
    name: pkg?.name ?? '',
    shortDescription: pkg?.shortDescription ?? '',
    features: pkg?.features ?? [],
    price: pkg ? String(pkg.price) : '',
    validityAmount: String(inWeeks ? days / 7 : days),
    validityUnit: inWeeks ? 'weeks' : 'days',
    sessions: pkg ? String(pkg.sessions) : '',
    guestCredits: String(pkg?.guestCredits ?? 0),
    displayOrder: String(pkg?.displayOrder ?? 0),
    isFeatured: pkg?.isFeatured ?? false,
    rules: pkg?.rules.length
      ? pkg.rules.map((rule) => ({
          credits: String(rule.credits),
          allowedClassTypes: [...rule.allowedClassTypes],
          limitTime: rule.timeWindow !== null,
          start: rule.timeWindow?.start ?? '07:00',
          end: rule.timeWindow?.end ?? '11:00',
          label: rule.label ?? '',
        }))
      : [emptyRule()],
  };
}

/** '' → NaN para que Zod reporte el campo vacío. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

function toInput(state: FormState, isUnlimited: boolean, currentSessions: number): PackageInput {
  const base = {
    name: state.name,
    shortDescription: state.shortDescription,
    features: state.features,
    price: toNumber(state.price),
    validity: { amount: toNumber(state.validityAmount), unit: state.validityUnit },
    displayOrder: toNumber(state.displayOrder),
    isFeatured: state.isFeatured,
  };
  if (state.kind === 'special') {
    return {
      kind: 'special',
      ...base,
      guestCredits: toNumber(state.guestCredits),
      rules: state.rules.map((rule) => ({
        credits: toNumber(rule.credits),
        allowedClassTypes: rule.allowedClassTypes,
        timeWindow: rule.limitTime ? { start: rule.start, end: rule.end } : null,
        label: rule.label.trim() || null,
      })),
    };
  }
  // Open Lab es ilimitado: sus sesiones no se editan (el servidor las conserva).
  return { kind: 'standard', ...base, sessions: isUnlimited ? Math.max(1, currentSessions) : toNumber(state.sessions) };
}

function validityDaysOf(state: FormState): number {
  const amount = Number.parseInt(state.validityAmount, 10) || 0;
  return state.validityUnit === 'weeks' ? amount * 7 : amount;
}

interface PackageFormProps {
  /** Paquete a editar; sin él, el formulario crea uno nuevo. */
  pkg?: AdminPackageView;
}

/** Alta y edición de paquetes (SPEC-SPECIAL-PACKAGES §7.3). Valida con el mismo esquema Zod que el servidor. */
export function PackageForm({ pkg }: PackageFormProps) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => initialState(pkg));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [descriptionOverflow, setDescriptionOverflow] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = Boolean(pkg);
  const isUnlimited = pkg?.isUnlimited ?? false;

  function validate(next: FormState): Record<string, string> {
    const result = packageInputSchema.safeParse(toInput(next, isUnlimited, pkg?.sessions ?? 0));
    return result.success ? {} : toFieldErrors(result.error);
  }

  function change(patch: Partial<FormState>) {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (submitted) setErrors(validate(next));
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerMessage(null);
    const found = validate(state);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const input = toInput(state, isUnlimited, pkg?.sessions ?? 0);
    startTransition(async () => {
      const result = pkg ? await updatePackageAction(pkg.id, input) : await createPackageAction(input);
      if (result.success) {
        router.push('/admin/packages');
        router.refresh();
        return;
      }
      setServerMessage(result.error);
      setErrors(result.fieldErrors ?? (result.field ? { [result.field]: result.error } : {}));
    });
  }

  const preview = useMemo(
    () =>
      toPackageCardView({
        id: pkg?.id ?? 'preview',
        name: state.name || 'Nombre del paquete',
        kind: state.kind,
        guest: isUnlimited,
        sessions: state.kind === 'special' ? ruleCredits(state.rules) : Number.parseInt(state.sessions, 10) || 0,
        price: Number.parseInt(state.price, 10) || 0,
        validityDays: validityDaysOf(state),
        guestCredits: Number.parseInt(state.guestCredits, 10) || 0,
        shortDescription: state.shortDescription || 'Descripción corta',
        features: state.features.filter((f) => f.trim()),
        isFeatured: state.isFeatured,
        rules: state.rules
          .filter((rule) => rule.allowedClassTypes.length > 0)
          .map((rule) => ({
            label: rule.label.trim() || null,
            credits: Number.parseInt(rule.credits, 10) || 0,
            allowedClassTypes: rule.allowedClassTypes,
            windowStart: rule.limitTime ? rule.start : null,
            windowEnd: rule.limitTime ? rule.end : null,
          })),
      }),
    [state, pkg?.id, isUnlimited]
  );

  const descriptionError = errors.shortDescription ?? (descriptionOverflow ? DESCRIPTION_TOO_LONG : undefined);
  const salesCount = pkg?.salesCount ?? 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {salesCount > 0 && (
          <p className="rounded-lg bg-warm-wood/15 border border-warm-wood/30 p-3 font-body text-sm text-secondary">
            Este paquete ya tiene {salesCount} {salesCount === 1 ? 'venta' : 'ventas'}. Los cambios aplican solo a compras nuevas.
          </p>
        )}

        <div>
          <p className="font-body text-body-md font-semibold text-on-surface mb-2">Tipo</p>
          {isEdit ? (
            <p className="font-body text-body-md text-on-surface">{state.kind === 'special' ? 'Especial' : 'Estándar'}</p>
          ) : (
            <div className="flex gap-6">
              {(['standard', 'special'] as const).map((kind) => (
                <label key={kind} className="inline-flex items-center gap-2 min-h-11 font-body text-body-md">
                  <input
                    type="radio"
                    name="kind"
                    checked={state.kind === kind}
                    onChange={() => change({ kind })}
                    className="accent-primary"
                  />
                  {kind === 'special' ? 'Especial (reglas por disciplina)' : 'Estándar'}
                </label>
              ))}
            </div>
          )}
        </div>

        <Input
          id="name"
          label="Nombre"
          maxLength={NAME_MAX}
          value={state.name}
          onChange={(e) => change({ name: e.target.value })}
          error={errors.name}
          required
        />

        <div>
          <Input
            id="shortDescription"
            label="Descripción corta"
            maxLength={DESCRIPTION_MAX}
            value={state.shortDescription}
            onChange={(e) => {
              const value = e.target.value;
              setDescriptionOverflow(value.length > DESCRIPTION_MAX);
              change({ shortDescription: value.slice(0, DESCRIPTION_MAX) });
            }}
            error={descriptionError}
            required
          />
          <p
            className={`mt-1 text-right font-body text-[13px] ${
              state.shortDescription.length >= DESCRIPTION_MAX ? 'text-error' : 'text-on-surface-variant'
            }`}
          >
            {state.shortDescription.length}/{DESCRIPTION_MAX}
          </p>
        </div>

        <div className="space-y-3">
          <p className="font-body text-body-md font-semibold text-on-surface">Beneficios</p>
          {state.features.map((feature, index) => (
            <div key={index} className="flex items-start gap-2">
              <Input
                id={`feature-${index}`}
                label={`Beneficio ${index + 1}`}
                maxLength={FEATURE_MAX_LENGTH}
                value={feature}
                onChange={(e) =>
                  change({
                    features: state.features.map((f, i) => (i === index ? e.target.value.slice(0, FEATURE_MAX_LENGTH) : f)),
                  })
                }
                error={errors[`features.${index}`]}
                className="flex-1"
              />
              <span className="mt-11 font-body text-[13px] text-on-surface-variant w-12 text-right">
                {feature.length}/{FEATURE_MAX_LENGTH}
              </span>
              <button
                type="button"
                aria-label={`Quitar beneficio ${index + 1}`}
                onClick={() => change({ features: state.features.filter((_, i) => i !== index) })}
                className="mt-8 min-h-11 min-w-11 material-symbols-outlined text-outline hover:text-error"
              >
                close
              </button>
            </div>
          ))}
          {errors.features && (
            <p role="alert" className="font-body text-[13px] text-error">
              {errors.features}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={state.features.length >= FEATURES_MAX}
              onClick={() => change({ features: [...state.features, ''] })}
              className="min-h-11 px-4 font-body text-sm border border-outline-variant rounded-DEFAULT hover:bg-surface-container-low disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Agregar beneficio
            </button>
            {state.features.length >= FEATURES_MAX && (
              <span className="font-body text-[13px] text-on-surface-variant">Máximo {FEATURES_MAX} beneficios</span>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="price"
            label="Precio (MXN)"
            type="number"
            min={1}
            value={state.price}
            onChange={(e) => change({ price: e.target.value })}
            error={errors.price}
            required
          />
          {state.kind === 'standard' &&
            (isUnlimited ? (
              <div>
                <p className="font-body text-body-md font-semibold text-on-surface">Sesiones</p>
                <p className="mt-3 font-body text-body-md text-on-surface-variant">Ilimitado</p>
              </div>
            ) : (
              <Input
                id="sessions"
                label="Sesiones"
                type="number"
                min={1}
                value={state.sessions}
                onChange={(e) => change({ sessions: e.target.value })}
                error={errors.sessions}
                required
              />
            ))}
        </div>

        <div>
          <div className="flex items-end gap-3">
            <Input
              id="validityAmount"
              label="Vigencia"
              type="number"
              min={1}
              value={state.validityAmount}
              onChange={(e) => change({ validityAmount: e.target.value })}
              error={errors['validity.amount']}
              className="w-32"
            />
            <select
              aria-label="Unidad de vigencia"
              value={state.validityUnit}
              onChange={(e) => change({ validityUnit: e.target.value as ValidityUnit })}
              className="min-h-11 px-3 font-body text-body-md bg-surface border border-outline-variant rounded-DEFAULT"
            >
              <option value="days">días</option>
              <option value="weeks">semanas</option>
            </select>
            <span className="min-h-11 inline-flex items-center font-body text-body-md text-on-surface-variant">
              = {validityDaysOf(state)} días
            </span>
          </div>
          <p className="mt-1 font-body text-[13px] text-on-surface-variant">Cuenta desde que se confirma el pago.</p>
          {errors.validity && (
            <p role="alert" className="font-body text-[13px] text-error">
              {errors.validity}
            </p>
          )}
        </div>

        {state.kind === 'special' && (
          <>
            <div className="space-y-2">
              <p className="font-body text-body-md font-semibold text-on-surface">Reglas por disciplina</p>
              <PackageRulesBuilder rules={state.rules} onChange={(rules) => change({ rules })} errors={errors} />
            </div>
            <Input
              id="guestCredits"
              label="Pases de invitado"
              type="number"
              min={0}
              max={10}
              value={state.guestCredits}
              onChange={(e) => change({ guestCredits: e.target.value })}
              error={errors.guestCredits}
              className="w-40"
            />
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="displayOrder"
            label="Orden"
            type="number"
            min={0}
            value={state.displayOrder}
            onChange={(e) => change({ displayOrder: e.target.value })}
            error={errors.displayOrder}
          />
          <div>
            <label className="inline-flex items-center gap-2 min-h-11 mt-7 font-body text-body-md text-on-surface">
              <input
                type="checkbox"
                checked={state.isFeatured}
                onChange={(e) => change({ isFeatured: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              Destacar en la landing
            </label>
            <p className="font-body text-[13px] text-on-surface-variant">Solo un paquete puede estar destacado.</p>
          </div>
        </div>

        {serverMessage && (
          <p role="alert" className="font-body text-sm text-error">
            {serverMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full min-h-11 px-6 py-3 font-semibold uppercase tracking-widest text-label-caps bg-soft-charcoal text-on-primary rounded-DEFAULT transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear paquete'}
        </button>

        <Link
          href="/admin/packages"
          className="block text-center text-primary underline underline-offset-2 hover:text-secondary min-h-11 font-body text-body-md"
        >
          Volver a paquetes
        </Link>
      </form>

      <aside className="lg:sticky lg:top-6 self-start space-y-2">
        <p className="font-body text-label-caps uppercase tracking-widest text-on-surface-variant">Vista previa</p>
        <div data-testid="package-preview" className="bg-surface-cream p-4 rounded-xl">
          <PackageCard
            pkg={preview}
            action={
              <span className="block w-full py-4 border border-outline text-center text-[12px] font-semibold tracking-widest uppercase">
                {preview.ctaLabel}
              </span>
            }
          />
        </div>
      </aside>
    </div>
  );
}
