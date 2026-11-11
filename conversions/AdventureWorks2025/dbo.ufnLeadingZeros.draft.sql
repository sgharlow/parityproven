-- First draft: left-pad with zeros to 8 characters.

CREATE OR REPLACE FUNCTION dbo.ufn_leading_zeros(value integer)
RETURNS varchar(8)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lpad(value::text, 8, '0')
$$;
