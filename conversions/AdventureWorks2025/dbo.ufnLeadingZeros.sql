-- PostgreSQL conversion of dbo.ufnLeadingZeros (AdventureWorks2025).
-- Engine: Kiro; first draft (lpad) was corrected after the harness failed it (see pair record).
--
-- CONVERT(varchar(8), int) returns '*' when the number needs more than 8 characters, and the source then
-- pads that single character to 8 ('0000000*'). lpad() would silently truncate to the first 8 digits.
-- Negative numbers keep their sign inside the padding, as in the source ('000000-5'). NULL stays NULL.

CREATE OR REPLACE FUNCTION dbo.ufn_leading_zeros(value integer)
RETURNS varchar(8)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    return_value text;
BEGIN
    return_value := value::text;
    IF length(return_value) > 8 THEN
        return_value := '*';
    END IF;
    RETURN repeat('0', 8 - length(return_value)) || return_value;
END;
$$;
