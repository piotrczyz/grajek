<!-- preview-link -->

**Co zmieniło się po Twoich uwagach:** Tabela „Nuta po nucie” mieści się teraz w całości na telefonie (360 px) także z szerszą czcionką systemu, jakiej używają testy automatyczne, i to nawet przy napisach nieco większych niż w aplikacji. Kolumna „Czas” pokazuje tylko przesunięcie w milisekundach (np. „+600 ms”), bo słowo „za wcześnie” / „za późno” jest obok w kolumnie „Ocena”. Test szerokości sprawdza teraz także szerszą czcionkę, więc taki problem wyjdzie od razu, a nie dopiero w automatycznych testach.

**Co zostaje bez zmian:** automatyczna wysyłka wyniku z szacunkiem rozpoznawania, panel diagnostyczny, informacja o anonimowych danych i przełącznik wyłączenia. Ta część opiera się na poprzedniej i wchodzi po niej.

**Proszę sprawdzić na podglądzie** (`?spike=nuty`, na telefonie):
- Tabela „Nuta po nucie” nie wychodzi poza ekran i nie trzeba jej przewijać w bok; statusy jak „dobrze” czy „za wcześnie” widać w całości.
- Zagraj melodię do końca: pod wynikiem nie ma pytania ani oceny rozpoznawania; szacunek jest tylko w panelu „Diagnostyka”.

**Status:** Gotowe do scalenia, gdy automatyczne testy przejdą na zielono i sprawdzisz podgląd.
