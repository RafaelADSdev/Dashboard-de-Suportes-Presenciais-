export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      info_slides: {
        Row: {
          content: string
          created_at: string
          id: string
          sort_order: number
          superintendencia: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sort_order?: number
          superintendencia?: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sort_order?: number
          superintendencia?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          atualizado_em: string
          corretor: string
          criado_em: string
          departamento: string
          diretoria: string
          estagio_bitrix: string | null
          ferramenta: string
          id: string
          interacoes: number
          lider: string
          modulo: string
          negocios_ativos: number
          nivel_impacto: string
          reincidente: boolean
          resolvido_em: string | null
          solicitante: string
          solicitante_foto: string | null
          status: string
          superintendencia: string
          responsavel: string
          tema_reincidencia: string | null
          ticket_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          corretor?: string
          criado_em?: string
          departamento?: string
          diretoria?: string
          estagio_bitrix?: string | null
          ferramenta: string
          id?: string
          interacoes?: number
          lider?: string
          modulo?: string
          negocios_ativos?: number
          nivel_impacto?: string
          reincidente?: boolean
          resolvido_em?: string | null
          solicitante: string
          solicitante_foto?: string | null
          status?: string
          superintendencia?: string
          responsavel?: string
          tema_reincidencia?: string | null
          ticket_id: string
          tipo?: string
          titulo?: string
        }
        Update: {
          atualizado_em?: string
          corretor?: string
          criado_em?: string
          departamento?: string
          diretoria?: string
          estagio_bitrix?: string | null
          ferramenta?: string
          id?: string
          interacoes?: number
          lider?: string
          modulo?: string
          negocios_ativos?: number
          nivel_impacto?: string
          reincidente?: boolean
          resolvido_em?: string | null
          solicitante?: string
          solicitante_foto?: string | null
          status?: string
          superintendencia?: string
          responsavel?: string
          tema_reincidencia?: string | null
          ticket_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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

export type TicketRow = Tables<"tickets">
