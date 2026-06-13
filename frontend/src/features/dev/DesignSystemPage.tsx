import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/MoneyText";
import { RiskBadge, MoraDot } from "@/components/RiskBadge";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Showcase del design system (Fase 1). Renderiza tokens y primitivas para
 * revisión visual en light y dark. No es parte de la app productiva.
 */
export function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-bg p-8 text-text">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Design System — NexoCred</h1>
          <p className="text-sm text-text-muted">Tokens y primitivas (light / dark)</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Botones</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button>Primario</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructivo</Button>
            <Button size="sm">Chico</Button>
            <Button size="lg">Grande</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Badges</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge tone="success">Aprobado</Badge>
            <Badge tone="warning">Pendiente</Badge>
            <Badge tone="danger">Rechazado</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="brand">Marca</Badge>
          </div>
        </Card>

        <Card>
          <CardTitle>Escala de mora (ordinal)</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge dias={0} />
            <RiskBadge dias={15} />
            <RiskBadge dias={45} />
            <RiskBadge dias={75} />
            <RiskBadge dias={120} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
            Dots:
            <MoraDot dias={0} /> <MoraDot dias={20} /> <MoraDot dias={50} />{" "}
            <MoraDot dias={80} /> <MoraDot dias={100} />
          </div>
        </Card>

        <Card>
          <CardTitle>Dinero (font-num + intent)</CardTitle>
          <div className="space-y-1 text-sm">
            <div>
              Neutral: <MoneyText value="1234567.89" />
            </div>
            <div>
              Ingreso: <MoneyText value="50000.00" intent="income" />
            </div>
            <div>
              Egreso: <MoneyText value="32500.50" intent="expense" />
            </div>
            <div>
              Nulo: <MoneyText value={null} />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Inputs</CardTitle>
          <div className="space-y-2">
            <Input placeholder="Texto…" />
            <Input placeholder="Deshabilitado" disabled />
          </div>
        </Card>

        <Card>
          <CardTitle>Superficies y elevación</CardTitle>
          <div className="space-y-2">
            <div className="rounded-md bg-surface-sunken p-3 text-sm">surface-sunken</div>
            <div className="rounded-md bg-surface p-3 text-sm shadow-sm">surface + shadow-sm</div>
            <div className="rounded-md bg-surface p-3 text-sm shadow-md">surface + shadow-md</div>
            <div className="rounded-md bg-brand-subtle p-3 text-sm text-brand">brand-subtle</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
