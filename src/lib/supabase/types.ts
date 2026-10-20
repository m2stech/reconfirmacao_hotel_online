export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          company_name: string
          created_at: string
          id: string
          institutional_footer: string
          institutional_logo_storage_path: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          company_name?: string
          created_at?: string
          id?: string
          institutional_footer?: string
          institutional_logo_storage_path?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          institutional_footer?: string
          institutional_logo_storage_path?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          completion_tokens: number
          created_at: string
          error_message: string | null
          estimated_cost_usd: number
          id: string
          model: string
          prompt_tokens: number
          prompt_version_id: string
          quote_id: string
          requested_by: string
          status: Database["public"]["Enums"]["quote_status"]
        }
        Insert: {
          completion_tokens?: number
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number
          id?: string
          model: string
          prompt_tokens?: number
          prompt_version_id: string
          quote_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["quote_status"]
        }
        Update: {
          completion_tokens?: number
          created_at?: string
          error_message?: string | null
          estimated_cost_usd?: number
          id?: string
          model?: string
          prompt_tokens?: number
          prompt_version_id?: string
          quote_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["quote_status"]
        }
        Relationships: [
          {
            foreignKeyName: "generations_prompt_version_id_fkey"
            columns: ["prompt_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      model_pricing: {
        Row: {
          input_per_million_usd: number
          model: string
          output_per_million_usd: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          input_per_million_usd: number
          model: string
          output_per_million_usd: number
          updated_at?: string
          updated_by: string
        }
        Update: {
          input_per_million_usd?: number
          model?: string
          output_per_million_usd?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_pricing_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      prompt_versions: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          version: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_attachments: {
        Row: {
          created_at: string
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          mime_type: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          mime_type: string
          quote_id: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
          mime_type?: string
          quote_id?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          agency: string
          ai_output: Json | null
          consultant: string
          created_at: string
          created_by: string
          destination: string
          end_date: string | null
          error_message: string | null
          form: Json
          id: string
          pptx_storage_path: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          agency: string
          ai_output?: Json | null
          consultant?: string
          created_at?: string
          created_by: string
          destination: string
          end_date?: string | null
          error_message?: string | null
          form: Json
          id?: string
          pptx_storage_path?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          agency?: string
          ai_output?: Json | null
          consultant?: string
          created_at?: string
          created_by?: string
          destination?: string
          end_date?: string | null
          error_message?: string | null
          form?: Json
          id?: string
          pptx_storage_path?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_is_active: { Args: never; Returns: boolean }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      owns_quote_storage_object: {
        Args: { object_name: string }
        Returns: boolean
      }
    }
    Enums: {
      attachment_kind: "agency_logo" | "flight_image" | "institutional_logo"
      quote_status: "draft" | "processing" | "done" | "error"
      user_role: "consultant" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  reconfirmacao: {
    Tables: {
      email_sends: {
        Row: {
          assunto: string
          corpo_html: string
          created_at: string
          created_by: string | null
          destinatario: string
          erro_detalhe: string | null
          graph_conversation_id: string | null
          graph_message_id: string | null
          id: string
          idioma: string | null
          internet_message_id: string | null
          reservation_id: string
          status: Database["reconfirmacao"]["Enums"]["email_send_status"]
          tipo: Database["reconfirmacao"]["Enums"]["email_send_kind"]
        }
        Insert: {
          assunto: string
          corpo_html: string
          created_at?: string
          created_by?: string | null
          destinatario: string
          erro_detalhe?: string | null
          graph_conversation_id?: string | null
          graph_message_id?: string | null
          id?: string
          idioma?: string | null
          internet_message_id?: string | null
          reservation_id: string
          status: Database["reconfirmacao"]["Enums"]["email_send_status"]
          tipo: Database["reconfirmacao"]["Enums"]["email_send_kind"]
        }
        Update: {
          assunto?: string
          corpo_html?: string
          created_at?: string
          created_by?: string | null
          destinatario?: string
          erro_detalhe?: string | null
          graph_conversation_id?: string | null
          graph_message_id?: string | null
          id?: string
          idioma?: string | null
          internet_message_id?: string | null
          reservation_id?: string
          status?: Database["reconfirmacao"]["Enums"]["email_send_status"]
          tipo?: Database["reconfirmacao"]["Enums"]["email_send_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "audit_status"
            referencedColumns: ["reservation_id"]
          },
          {
            foreignKeyName: "email_sends_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_emails: {
        Row: {
          bounced_em: string | null
          confiabilidade: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at: string
          email: string
          fonte: Database["reconfirmacao"]["Enums"]["contact_source"]
          hotel_id: string
          id: string
        }
        Insert: {
          bounced_em?: string | null
          confiabilidade?: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at?: string
          email: string
          fonte?: Database["reconfirmacao"]["Enums"]["contact_source"]
          hotel_id: string
          id?: string
        }
        Update: {
          bounced_em?: string | null
          confiabilidade?: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at?: string
          email?: string
          fonte?: Database["reconfirmacao"]["Enums"]["contact_source"]
          hotel_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_emails_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_replies: {
        Row: {
          confianca: number | null
          corpo_texto: string
          created_at: string
          divergencias: string | null
          email_send_id: string
          id: string
          internet_message_id: string
          metodo_interpretacao: Database["reconfirmacao"]["Enums"]["hotel_reply_interpretation_method"]
          numeros_confirmacao: Json
          openai_custo_usd: number | null
          openai_tokens_input: number | null
          openai_tokens_output: number | null
          pendencias: string | null
          recebido_em: string
          regime_alimentar_confirmado: boolean | null
          reserva_confirmada: boolean | null
          resumo: string | null
          status_pagamento: string | null
        }
        Insert: {
          confianca?: number | null
          corpo_texto: string
          created_at?: string
          divergencias?: string | null
          email_send_id: string
          id?: string
          internet_message_id: string
          metodo_interpretacao: Database["reconfirmacao"]["Enums"]["hotel_reply_interpretation_method"]
          numeros_confirmacao?: Json
          openai_custo_usd?: number | null
          openai_tokens_input?: number | null
          openai_tokens_output?: number | null
          pendencias?: string | null
          recebido_em: string
          regime_alimentar_confirmado?: boolean | null
          reserva_confirmada?: boolean | null
          resumo?: string | null
          status_pagamento?: string | null
        }
        Update: {
          confianca?: number | null
          corpo_texto?: string
          created_at?: string
          divergencias?: string | null
          email_send_id?: string
          id?: string
          internet_message_id?: string
          metodo_interpretacao?: Database["reconfirmacao"]["Enums"]["hotel_reply_interpretation_method"]
          numeros_confirmacao?: Json
          openai_custo_usd?: number | null
          openai_tokens_input?: number | null
          openai_tokens_output?: number | null
          pendencias?: string | null
          recebido_em?: string
          regime_alimentar_confirmado?: boolean | null
          reserva_confirmada?: boolean | null
          resumo?: string | null
          status_pagamento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_replies_email_send_id_fkey"
            columns: ["email_send_id"]
            isOneToOne: false
            referencedRelation: "audit_status"
            referencedColumns: ["last_email_send_id"]
          },
          {
            foreignKeyName: "hotel_replies_email_send_id_fkey"
            columns: ["email_send_id"]
            isOneToOne: false
            referencedRelation: "email_sends"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          confiabilidade_contato: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at: string
          id: string
          idioma: string | null
          nome: string
          nomes_alternativos: string[]
          pais: string | null
          pais_a_confirmar: boolean
          pais_fonte:
            | Database["reconfirmacao"]["Enums"]["contact_source"]
            | null
          ultima_confirmacao_em: string | null
          ultima_confirmacao_por: string | null
          updated_at: string
        }
        Insert: {
          confiabilidade_contato?: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at?: string
          id?: string
          idioma?: string | null
          nome: string
          nomes_alternativos?: string[]
          pais?: string | null
          pais_a_confirmar?: boolean
          pais_fonte?:
            | Database["reconfirmacao"]["Enums"]["contact_source"]
            | null
          ultima_confirmacao_em?: string | null
          ultima_confirmacao_por?: string | null
          updated_at?: string
        }
        Update: {
          confiabilidade_contato?: Database["reconfirmacao"]["Enums"]["contact_reliability"]
          created_at?: string
          id?: string
          idioma?: string | null
          nome?: string
          nomes_alternativos?: string[]
          pais?: string | null
          pais_a_confirmar?: boolean
          pais_fonte?:
            | Database["reconfirmacao"]["Enums"]["contact_source"]
            | null
          ultima_confirmacao_em?: string | null
          ultima_confirmacao_por?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          created_at: string
          created_by: string | null
          data_checkin: string | null
          data_checkout: string | null
          fornecedor: string | null
          hospedes: Json
          hotel_id: string | null
          id: string
          localizador: string
          localizador_externo: string | null
          regime_alimentar: string | null
          roomlist_arquivo: string | null
          tipo_habitacao: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_checkin?: string | null
          data_checkout?: string | null
          fornecedor?: string | null
          hospedes?: Json
          hotel_id?: string | null
          id?: string
          localizador: string
          localizador_externo?: string | null
          regime_alimentar?: string | null
          roomlist_arquivo?: string | null
          tipo_habitacao?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_checkin?: string | null
          data_checkout?: string | null
          fornecedor?: string | null
          hospedes?: Json
          hotel_id?: string | null
          id?: string
          localizador?: string
          localizador_externo?: string | null
          regime_alimentar?: string | null
          roomlist_arquivo?: string | null
          tipo_habitacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      audit_status: {
        Row: {
          hotel_id: string | null
          hotel_nome: string | null
          last_email_send_at: string | null
          last_email_send_id: string | null
          last_email_send_status:
            | Database["reconfirmacao"]["Enums"]["email_send_status"]
            | null
          last_hotel_reply_at: string | null
          last_hotel_reply_id: string | null
          localizador: string | null
          regime_alimentar_confirmado: boolean | null
          reserva_confirmada: boolean | null
          reservation_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_active_authenticated_user: { Args: never; Returns: boolean }
    }
    Enums: {
      contact_reliability: "confirmado" | "sugerido" | "obsoleto"
      contact_source: "manual" | "tavily"
      email_send_kind: "reconfirmacao_inicial" | "reenvio" | "resposta_manual"
      email_send_status: "enviado" | "erro" | "bounce"
      hotel_reply_interpretation_method: "regex" | "ia" | "manual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attachment_kind: ["agency_logo", "flight_image", "institutional_logo"],
      quote_status: ["draft", "processing", "done", "error"],
      user_role: ["consultant", "admin"],
    },
  },
  reconfirmacao: {
    Enums: {
      contact_reliability: ["confirmado", "sugerido", "obsoleto"],
      contact_source: ["manual", "tavily"],
      email_send_kind: ["reconfirmacao_inicial", "reenvio", "resposta_manual"],
      email_send_status: ["enviado", "erro", "bounce"],
      hotel_reply_interpretation_method: ["regex", "ia", "manual"],
    },
  },
} as const
