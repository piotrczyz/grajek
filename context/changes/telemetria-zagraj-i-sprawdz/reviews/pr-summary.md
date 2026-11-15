<!-- preview-link -->

**Co zmieniło się po Twoich uwagach:** Tabela „Nuta po nucie” zostaje przebudowana tak, żeby na telefonie (360 px) mieściła się w całości niezależnie od czcionki systemu, także gdy czcionka jest szersza lub większa. Kolumna „Czas” pokazuje już tylko przesunięcie w milisekundach, bo słowo „za wcześnie” / „za późno” jest obok w kolumnie „Ocena”. Test szerokości sprawdza teraz także szerszą czcionkę, więc ten sam problem wyjdzie od razu, a nie dopiero w automatycznych testach.

**Co zostaje bez zmian:** automatyczna wysyłka wyniku z szacunkiem rozpoznawania, panel diagnostyczny, informacja o anonimowych danych i przełącznik wyłączenia. Ta część opiera się na poprzedniej i wchodzi po niej.

**Proszę sprawdzić na podglądzie** (`?spike=nuty`, na telefonie):
- Tabela „Nuta po nucie” nie wychodzi poza ekran i nie trzeba jej przewijać w bok; statusy jak „dobrze” czy „za wcześnie” widać w całości.
- Zagraj melodię do końca: pod wynikiem nie ma pytania ani oceny rozpoznawania; szacunek jest tylko w panelu „Diagnostyka”.

**Status:** Jeszcze niegotowe: poprawka układu tabeli jest w toku, potem automatyczne testy muszą przejść na zielono.
