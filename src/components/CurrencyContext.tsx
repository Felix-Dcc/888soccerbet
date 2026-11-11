"use client";
import { createContext, useContext } from "react";
import { GHS_CURRENCY, type Currency } from "@/lib/currency";

/** The signed-in player's display currency (GHS, or Naira for Nigerian players), set once by the root layout. */
const CurrencyCtx = createContext<Currency>(GHS_CURRENCY);
export const CurrencyProvider = CurrencyCtx.Provider;
export const useCurrency = () => useContext(CurrencyCtx);
