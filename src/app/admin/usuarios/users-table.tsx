"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type UsuarioRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: "consultant" | "admin";
  active: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  consultant: "Consultor",
  admin: "Administrador",
};

export function UsersTable({ usuarioAtualId }: { usuarioAtualId: string }) {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [emailConvite, setEmailConvite] = useState("");
  const [nomeConvite, setNomeConvite] = useState("");
  const [roleConvite, setRoleConvite] = useState<"consultant" | "admin">("consultant");
  const [convidando, setConvidando] = useState(false);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/usuarios");
      const dados = await resposta.json();
      if (!dados.ok) {
        setErro(dados.erro ?? "Falha ao carregar usuários.");
        return;
      }
      setUsuarios(dados.usuarios);
    } catch {
      setErro("Falha ao carregar usuários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da tabela, mesmo padrão de HotelsTable/AuditTable
    carregar();
  }, []);

  async function convidar() {
    if (!emailConvite.trim() || !nomeConvite.trim()) return;
    setConvidando(true);
    try {
      const resposta = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailConvite.trim(),
          fullName: nomeConvite.trim(),
          role: roleConvite,
        }),
      });
      const dados = await resposta.json();
      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao convidar usuário.");
        return;
      }
      toast.success("Convite enviado.");
      setEmailConvite("");
      setNomeConvite("");
      setRoleConvite("consultant");
      carregar();
    } catch {
      toast.error("Falha de rede ao convidar usuário.");
    } finally {
      setConvidando(false);
    }
  }

  async function atualizar(id: string, dados: { active?: boolean; role?: "consultant" | "admin" }) {
    setAtualizandoId(id);
    try {
      const resposta = await fetch(`/api/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      const corpo = await resposta.json();
      if (!corpo.ok) {
        toast.error(corpo.erro ?? "Falha ao atualizar usuário.");
        return;
      }
      setUsuarios((atual) => atual.map((usuario) => (usuario.id === id ? corpo.usuario : usuario)));
      toast.success("Usuário atualizado.");
    } catch {
      toast.error("Falha de rede ao atualizar usuário.");
    } finally {
      setAtualizandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="convite-nome" className="text-xs text-muted-foreground">
            Nome
          </Label>
          <Input
            id="convite-nome"
            value={nomeConvite}
            onChange={(event) => setNomeConvite(event.target.value)}
            placeholder="Nome completo"
            className="w-48"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="convite-email" className="text-xs text-muted-foreground">
            E-mail
          </Label>
          <Input
            id="convite-email"
            type="email"
            value={emailConvite}
            onChange={(event) => setEmailConvite(event.target.value)}
            placeholder="nome@bvgroup.com.br"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="convite-role" className="text-xs text-muted-foreground">
            Papel
          </Label>
          <Select value={roleConvite} onValueChange={(valor) => setRoleConvite(valor as "consultant" | "admin")}>
            <SelectTrigger id="convite-role" className="w-40">
              <SelectValue>{ROLE_LABEL[roleConvite]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABEL).map(([valor, label]) => (
                <SelectItem key={valor} value={valor}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={convidar} disabled={convidando || !emailConvite.trim() || !nomeConvite.trim()}>
          {convidando ? "Convidando..." : "Convidar"}
        </Button>
      </div>

      {erro ? (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-[15px] border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : usuarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              usuarios.map((usuario) => {
                const ehUsuarioAtual = usuario.id === usuarioAtualId;
                return (
                  <TableRow key={usuario.id}>
                    <TableCell className="font-medium">{usuario.full_name ?? "—"}</TableCell>
                    <TableCell>{usuario.email}</TableCell>
                    <TableCell>
                      <Select
                        value={usuario.role}
                        disabled={ehUsuarioAtual || atualizandoId === usuario.id}
                        onValueChange={(valor) =>
                          atualizar(usuario.id, { role: valor as "consultant" | "admin" })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue>{ROLE_LABEL[usuario.role]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABEL).map(([valor, label]) => (
                            <SelectItem key={valor} value={valor}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={usuario.active ? "default" : "outline"}>
                        {usuario.active ? "Ativo" : "Desativado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={ehUsuarioAtual || atualizandoId === usuario.id}
                        onClick={() => atualizar(usuario.id, { active: !usuario.active })}
                      >
                        {atualizandoId === usuario.id
                          ? "Salvando..."
                          : usuario.active
                            ? "Desativar"
                            : "Reativar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">{usuarios.length} usuário(s)</p>
    </div>
  );
}
