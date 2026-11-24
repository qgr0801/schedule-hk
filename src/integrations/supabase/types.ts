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
      customer_management_sessions: {
        Row: { customer_id: string; total: number; starts_on: string; starts_at: string | null; initial_used: number }
        Insert: { customer_id: string; total: number; starts_on: string; starts_at?: string | null; initial_used?: number }
        Update: { total?: number; starts_on?: string; starts_at?: string | null; initial_used?: number }
        Relationships: []
      }
      monthly_work_reports: {
        Row: { id: string; employee_id: string; report_month: string; report_date: string | null; shot_edit_count: number; influencer_upload_count: number; feed_upload_count: number; customer_content: string; upload_count: number; work_counts: Json; work_checks: Json; memo: string; links: Json; version: number; created_by: string; updated_by: string; created_at: string; updated_at: string }
        Insert: { id?: string; employee_id: string; report_month: string; shot_edit_count?: number; influencer_upload_count?: number; feed_upload_count?: number; customer_content?: string; upload_count?: number; work_counts?: Json; work_checks?: Json; memo?: string; links?: Json; version?: number; created_by?: string; updated_by?: string; created_at?: string; updated_at?: string }
        Update: { id?: string; employee_id?: string; report_month?: string; shot_edit_count?: number; influencer_upload_count?: number; feed_upload_count?: number; customer_content?: string; upload_count?: number; work_counts?: Json; work_checks?: Json; memo?: string; links?: Json; version?: number; updated_by?: string; updated_at?: string }
        Relationships: []
      }
      monthly_work_report_history: {
        Row: { id: string; report_id: string; request: Json; snapshot: Json; changed_by: string; changed_at: string }
        Insert: { id: string; report_id: string; request: Json; snapshot: Json; changed_by?: string; changed_at?: string }
        Update: { id?: string; report_id?: string; request?: Json; snapshot?: Json; changed_by?: string; changed_at?: string }
        Relationships: []
      }

      external_performance_routes: {
        Row: { staff_id: string; route_id: string }
        Insert: { staff_id: string; route_id: string }
        Update: { route_id?: string }
        Relationships: []
      }

      booking_routes: {
        Row: { id: string; name: string; is_active: boolean; created_at: string }
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string }
        Update: { id?: string; name?: string; is_active?: boolean; created_at?: string }
        Relationships: []
      }

      product_routes: {
        Row: { id: string; name: string; sort_order: number; deleted_at: string | null; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      product_catalog_history: {
        Row: { id: string; product_id: string; action: string; request: Json; old_data: Json; new_data: Json; changed_by: string; changed_at: string }
        Insert: never
        Update: never
        Relationships: []
      }

      work_product_sales: {
        Row: { id: string; product_id: string; customer_id: string | null; product_name: string; quantity: number; unit_price: number; paid_on: string; method: string; memo: string; created_by: string; created_at: string }
        Insert: never
        Update: never
        Relationships: []
      }

      work_metric_labels: {
        Row: { id: string; label: string }
        Insert: { id: string; label: string }
        Update: { label?: string }
        Relationships: []
      }
      freelancer_attendance: {
        Row: { id: string; employee_id: string; start_at: string; end_at: string; memo: string; work_type: "internal" | "external" | null; created_by: string }
        Insert: { id?: string; employee_id: string; start_at: string; end_at: string; memo?: string; work_type?: "internal" | "external" | null }
        Update: { employee_id?: string; start_at?: string; end_at?: string; memo?: string; work_type?: "internal" | "external" | null }
        Relationships: []
      }
      products: {
        Row: { id: string; name: string; price: number; stock: number; is_active: boolean; unit: string; route_id: string | null; deleted_at: string | null; stock_confirmed: boolean; import_key: string | null }
        Insert: { name: string; price?: number }
        Update: { name?: string; price?: number; is_active?: boolean; unit?: string }
        Relationships: []
      }
      customer_payments: {
        Row: { reservation_id: string; customer_id: string; paid_on: string; rows: Json; sales: Json; memo: string; version: number; updated_by: string; updated_at: string }
        Insert: never
        Update: never
        Relationships: []
      }
      stock_movements: {
        Row: { id: string; product_id: string; quantity: number; reason: string; reservation_id: string | null; created_at: string; created_by: string; movement_kind: string; effective_on: string }
        Insert: never
        Update: never
        Relationships: []
      }
      employees: {
        Row: { id: string; name: string; is_active: boolean; created_at: string }
        Insert: { id?: string; name: string; is_active?: boolean; created_at?: string }
        Update: { name?: string; is_active?: boolean }
        Relationships: []
      }
      booking_settings: {
        Row: {
          services: string[]
          public_services: string[]
          cancelled_slot_reusable: boolean
          id: boolean
          slot_minutes: number
          trial_mode: boolean
          updated_at: string
        }
        Insert: {
          services?: string[]
          public_services?: string[]
          cancelled_slot_reusable?: boolean
          id?: boolean
          slot_minutes?: number
          trial_mode?: boolean
          updated_at?: string
        }
        Update: {
          services?: string[]
          public_services?: string[]
          cancelled_slot_reusable?: boolean
          id?: boolean
          slot_minutes?: number
          trial_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      calendar_display_settings: {
        Row: {
          color_mode: string
          fields: string[]
          updated_at: string
          view: string
        }
        Insert: {
          color_mode?: string
          fields?: string[]
          updated_at?: string
          view: string
        }
        Update: {
          color_mode?: string
          fields?: string[]
          updated_at?: string
          view?: string
        }
        Relationships: []
      }
      customer_categories: {
        Row: {
          color: string
          id: string
          name: string
          position: number
          slot: number
          updated_at: string
        }
        Insert: {
          color: string
          id?: string
          name: string
          position: number
          slot: number
          updated_at?: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          position?: number
          slot?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_category_tags: {
        Row: {
          category_id: string
          customer_id: string
        }
        Insert: {
          category_id: string
          customer_id: string
        }
        Update: {
          category_id?: string
          customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_category_tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "customer_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_category_tags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birth_date: string | null
          gender: string | null
          category_id: string | null
          created_at: string
          created_by: string
          customer_no: number
          id: string
          is_test: boolean
          memo: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          gender?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          customer_no?: number
          id?: string
          is_test?: boolean
          memo?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          gender?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string
          customer_no?: number
          id?: string
          is_test?: boolean
          memo?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "customer_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      day_sections: {
        Row: {
          active: boolean
          name: string
          position: number
        }
        Insert: {
          active?: boolean
          name: string
          position: number
        }
        Update: {
          active?: boolean
          name?: string
          position?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_test: boolean
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_test?: boolean
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_test?: boolean
        }
        Relationships: []
      }
      reservation_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          owner_id: string
          reservation_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          owner_id: string
          reservation_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          owner_id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["reservation_status"] | null
          id: string
          owner_id: string
          reason: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          owner_id: string
          reason?: string | null
          reservation_id: string
          to_status: Database["public"]["Enums"]["reservation_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["reservation_status"] | null
          id?: string
          owner_id?: string
          reason?: string | null
          reservation_id?: string
          to_status?: Database["public"]["Enums"]["reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reservation_status_history_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_status_settings: {
        Row: {
          bg_color: string
          border_color: string
          status: Database["public"]["Enums"]["reservation_status"]
          text_color: string
          updated_at: string
        }
        Insert: {
          bg_color: string
          border_color: string
          status: Database["public"]["Enums"]["reservation_status"]
          text_color: string
          updated_at?: string
        }
        Update: {
          bg_color?: string
          border_color?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          text_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservation_view_grants: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          viewer_id?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          end_at: string
          id: string
          is_test: boolean
          memo: string | null
          public_service: string
          room: string | null
          section: number | null
          service_detail: string
          service: string
          booking_route_id: string | null
          staff_id: string | null
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          end_at: string
          id?: string
          is_test?: boolean
          memo?: string | null
          public_service?: string
          room?: string | null
          section?: number | null
          service_detail?: string
          service: string
          booking_route_id?: string | null
          staff_id?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          end_at?: string
          id?: string
          is_test?: boolean
          memo?: string | null
          public_service?: string
          room?: string | null
          section?: number | null
          service_detail?: string
          service?: string
          booking_route_id?: string | null
          staff_id?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_section_fkey"
            columns: ["section"]
            isOneToOne: false
            referencedRelation: "day_sections"
            referencedColumns: ["position"]
          },
          {
            foreignKeyName: "reservations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_shares: {
        Row: {
          schedule_id: string
          user_id: string
        }
        Insert: {
          schedule_id: string
          user_id: string
        }
        Update: {
          schedule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_shares_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          end_at: string
          id: string
          memo: string | null
          owner_id: string
          start_at: string
          title: string
          visibility: Database["public"]["Enums"]["schedule_visibility"]
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          memo?: string | null
          owner_id?: string
          start_at: string
          title: string
          visibility?: Database["public"]["Enums"]["schedule_visibility"]
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          memo?: string | null
          owner_id?: string
          start_at?: string
          title?: string
          visibility?: Database["public"]["Enums"]["schedule_visibility"]
        }
        Relationships: []
      }
      staff_color_settings: {
        Row: {
          color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_color_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permission_log: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          kind: string
          new_data: Json | null
          old_data: Json | null
          user_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          kind: string
          new_data?: Json | null
          old_data?: Json | null
          user_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      staff_view_scopes: {
        Row: {
          can_view_pii: boolean
          fields: string[]
          menus: string[]
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_view_pii?: boolean
          fields?: string[]
          menus?: string[]
          scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_view_pii?: boolean
          fields?: string[]
          menus?: string[]
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_view_scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_feedback: {
        Row: {
          content: string
          created_at: string
          created_by: string
          device: string
          id: string
          menu: string
          occurred_on: string
          reporter_id: string
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string
          device?: string
          id?: string
          menu: string
          occurred_on?: string
          reporter_id: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          device?: string
          id?: string
          menu?: string
          occurred_on?: string
          reporter_id?: string
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_feedback_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      management_sessions_used: { Args: { _customer: string; _before: string; _exclude?: string }; Returns: number }
      admin_business_overview: { Args: { _from: string; _to: string }; Returns: Json }
      admin_route_collection_report: { Args: { _from: string; _to: string; _route?: string; _kind?: string }; Returns: Json }
      admin_sales_by_route_category: { Args: { _from: string; _to: string; _route?: string; _unassigned?: boolean }; Returns: Json }
      register_customer_checked: {
        Args: { _name: string; _phone: string | null; _birth_date: string | null; _gender: string | null; _memo: string | null; _category: string | null; _confirm_same_name: boolean };
        Returns: { id: string; customer_no: number }[];
      }
      admin_filtered_collections: { Args: { _from: string; _to: string; _route?: string; _kind?: string; _category?: string; _unassigned?: boolean }; Returns: Json }
      save_admin_settlement: { Args: { _id: string; _event: string; _from: string; _to: string; _route: string | null; _kind: string; _amount: number; _completed: number; _memo: string; _version?: number }; Returns: string }

      save_monthly_work_report_v4: { Args: { _id: string; _event: string; _employee: string; _month: string; _shot_count: number; _influencer_count: number; _upload_count: number; _memo: string; _links: Json; _feed_count: number; _customer_content: string; _counts: Json; _version?: number }; Returns: string }
      save_work_report_by_date: { Args: { _id: string; _event: string; _employee: string; _month: string; _date: string | null; _shot_count: number; _influencer_count: number; _upload_count: number; _memo: string; _links: Json; _feed_count: number; _customer_content: string; _counts: Json; _version?: number }; Returns: string }

      save_monthly_work_report_v3: { Args: { _id: string; _event: string; _employee: string; _month: string; _shot_count: number; _influencer_count: number; _upload_count: number; _memo: string; _links: Json; _feed_count: number; _customer_content: string; _checks: Json; _version?: number }; Returns: string }

      save_monthly_work_report_v2: { Args: { _id: string; _event: string; _employee: string; _month: string; _shot_count: number; _influencer_count: number; _upload_count: number; _memo: string; _links: Json; _feed_count: number; _customer_content: string; _version?: number }; Returns: string }

      save_monthly_work_report: { Args: { _id: string; _event: string; _employee: string; _month: string; _shot_count: number; _influencer_count: number; _upload_count: number; _memo: string; _links: Json; _version?: number }; Returns: string }

      route_settlement_summary: { Args: { _from: string; _to: string; _route?: string; _staff?: string; _customer?: string }; Returns: { route_id: string | null; route_name: string; kind: string; settlement_count: number; customer_count: number; cost: number; card: number; bank: number; krw: number; jpy: number; usd: number; cny: number }[] }

      save_booking_route: { Args: { _id: string; _name: string; _active?: boolean }; Returns: string }
      payment_summary_v2: { Args: { _customer?: string; _from?: string; _to?: string; _product_only?: boolean }; Returns: { kind: string; cost: number; card: number; bank: number; krw: number; jpy: number; usd: number; cny: number }[] }
      booking_activity_report: { Args: { _from: string; _to: string; _route?: string; _staff?: string; _customer?: string; _offset?: number }; Returns: { reservation_id: string; start_at: string; customer_name: string; staff_name: string; route_name: string; service_content: string; care_content: string; paid_on: string | null; payment_rows: Json; payment_memo: string; status: string }[] }
      external_performance_for_staff: { Args: { _from: string; _to: string; _staff: string }; Returns: Json }
      my_external_performance: { Args: { _from: string; _to: string }; Returns: Json }
      admin_sales_entries: {
        Args: { _from: string; _to: string; _scope: "category" | "settlement" | "performance"; _kind?: "service" | "care" | "art"; _route?: string; _unassigned?: boolean; _category?: string; _offset?: number };
        Returns: { entry_id: string; reservation_id: string | null; paid_on: string; customer_name: string; category: string; route_name: string; service_content: string; care_content: string; payment_rows: Json; payment_memo: string }[];
      }
      booking_activity_report_by_kind: { Args: { _from: string; _to: string; _kind?: "service" | "care"; _route?: string; _unassigned?: boolean; _offset?: number; _staff?: string; _customer?: string }; Returns: { reservation_id: string; start_at: string; customer_name: string; staff_name: string; route_name: string; service_content: string; care_content: string; paid_on: string | null; payment_rows: Json; payment_memo: string; status: string }[] }
      admin_filtered_booking_activity: { Args: { _from: string; _to: string; _kind?: "service" | "care"; _route?: string; _unassigned?: boolean; _offset?: number; _staff?: string; _customer?: string; _category?: string }; Returns: { reservation_id: string; start_at: string; customer_name: string; staff_name: string; route_name: string; service_content: string; care_content: string; paid_on: string | null; payment_rows: Json; payment_memo: string; status: string }[] }

      save_inventory_route: { Args: { _id: string; _name: string }; Returns: string }
      delete_inventory_route: { Args: { _id: string }; Returns: undefined }
      register_routed_product: { Args: { _id: string; _name: string; _price: number; _stock: number; _unit: string; _route?: string; _stock_confirmed?: boolean }; Returns: string }
      edit_inventory_product: { Args: { _id: string; _event: string; _name: string; _price: number; _unit: string; _route?: string; _initial_stock?: number }; Returns: string }
      set_inventory_product_active: { Args: { _id: string; _active: boolean }; Returns: undefined }
      set_inventory_product_deleted: { Args: { _id: string; _event: string; _deleted: boolean }; Returns: string }

      product_sales_report: { Args: { _from: string; _to: string; _offset?: number }; Returns: { sale_key: string; paid_on: string; customer_name: string; product_name: string; quantity: number; unit: string; unit_price: number; sales_amount: number; reservation_id: string | null; source: string; total_count: number; total_amount: number }[] }
      admin_product_sales_report: { Args: { _from: string; _to: string; _offset?: number; _route?: string; _unassigned?: boolean }; Returns: { sale_key: string; paid_on: string; customer_name: string; product_name: string; quantity: number; unit: string; unit_price: number; sales_amount: number; reservation_id: string | null; source: string; total_count: number; total_amount: number }[] }

      create_product_with_stock: { Args: { _id: string; _name: string; _price: number; _stock: number }; Returns: string }
      record_work_product_sale: { Args: { _id: string; _product: string; _quantity: number; _paid_on: string; _method: string; _memo?: string; _customer?: string }; Returns: string }
      product_inventory_overview: { Args: { _from: string; _to: string }; Returns: { product_id: string; received: number; sold: number; sales_amount: number }[] }

      record_inventory_batch: { Args: { _rows: Json }; Returns: undefined }
      correct_inventory_movement: { Args: { _id: string; _event: string; _expected_quantity: number; _expected_date: string; _expected_note: string; _quantity: number; _date: string; _note: string; _cancel: boolean }; Returns: undefined }
      record_product_movement: { Args: { _event: string; _product: string; _kind: string; _quantity: number; _date: string; _reason: string }; Returns: undefined }
      product_stock_ledger: { Args: { _product: string; _from: string; _to: string; _offset?: number }; Returns: { id: string; effective_on: string; movement_kind: string; quantity: number; reason: string; reservation_id: string | null; customer_name: string }[] }

      register_inventory_product: { Args: { _id: string; _name: string; _price: number; _stock: number; _unit?: string }; Returns: string }
      inventory_balance_report: { Args: { _from: string; _to: string }; Returns: { product_id: string; received: number; sold: number; sales_amount: number; opening_stock: number; used: number; internal_used: number; adjustment: number; closing_stock: number; notes: string }[] }
      record_product_sale: { Args: { _id: string; _product: string; _quantity: number; _paid_on: string; _method: string; _memo?: string; _customer?: string; _unit_price?: number }; Returns: string }

      register_work_attendance: { Args: { _id: string; _employee: string; _start: string; _end: string; _memo: string; _work_type: string }; Returns: string }
      attendance_summary: { Args: { _from: string; _to: string; _employee?: string }; Returns: { employee_id: string; minutes: number }[] }
      void_duplicate_reservation: { Args: { _id: string; _expected_updated_at: string; _reason: string }; Returns: undefined }
      save_reservation_payment: { Args: { _id: string; _reservation: Json; _payment: Json }; Returns: string }
      adjust_product_stock: { Args: { _event: string; _product: string; _quantity: number; _reason: string }; Returns: undefined }
      payment_summary: { Args: { _customer?: string; _from?: string; _to?: string }; Returns: { kind: string; cost: number; card: number; krw: number; jpy: number; usd: number; cny: number }[] }
      product_payment_summary: { Args: { _customer?: string; _from?: string; _to?: string }; Returns: { kind: string; cost: number; card: number; krw: number; jpy: number; usd: number; cny: number }[] }
      calendar_reservations: {
        Args: { _from: string; _to: string }
        Returns: {
          access: string
          category_id: string
          created_by: string
          customer_name: string
          customer_no: number
          customer_phone: string
          end_at: string
          id: string
          memo: string
          public_service: string
          room: string
          section: number
          service: string
          staff_id: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          visible: string[]
        }[]
      }
      can_edit_customer: {
        Args: { _customer: string; _user: string }
        Returns: boolean
      }
      can_view_customer: {
        Args: { _customer: string; _viewer: string }
        Returns: boolean
      }
      can_view_full: {
        Args: { _owner: string; _viewer: string }
        Returns: boolean
      }
      can_view_owner: {
        Args: { _owner: string; _viewer: string }
        Returns: boolean
      }
      calendar_customer_id: {
        Args: { _reservation: string }
        Returns: string | null
      }
      customer_visit_history: {
        Args: { _reservation: string }
        Returns: {
          end_at: string
          public_service: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      find_overlaps: {
        Args: {
          _end: string
          _exclude: string
          _section: number
          _staff: string
          _start: string
        }
        Returns: {
          conflict: string
          end_at: string
          public_service: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_staff: { Args: { _user: string }; Returns: boolean }
      is_schedule_owner: {
        Args: { _schedule: string; _user: string }
        Returns: boolean
      }
      is_schedule_shared: {
        Args: { _schedule: string; _user: string }
        Returns: boolean
      }
      shared_reservations: {
        Args: { _from: string; _to: string }
        Returns: {
          created_by: string
          end_at: string
          id: string
          section: number
          service: string
          staff_id: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
        }[]
      }
      staff_directory: {
        Args: never
        Returns: {
          created_at: string
          department: string
          full_name: string
          id: string
          is_active: boolean
        }[]
      }
      staff_emails: {
        Args: never
        Returns: {
          email: string
          id: string
        }[]
      }
      staff_has_field: {
        Args: { _field: string; _user: string }
        Returns: boolean
      }
      suggest_staff_color: { Args: { _n: number }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "internal" | "external"
      reservation_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "arrived"
        | "paid"
        | "cancelled"
        | "no_show"
        | "changed"
      schedule_visibility: "public" | "selected" | "private"
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
      app_role: ["admin", "internal", "external"],
      reservation_status: [
        "pending",
        "confirmed",
        "completed",
        "arrived",
        "paid",
        "cancelled",
        "no_show",
        "changed",
      ],
      schedule_visibility: ["public", "selected", "private"],
    },
  },
} as const
